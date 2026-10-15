"""Build the static dashboard from checked-in BIS and World Bank snapshots."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
raw, out = ROOT / 'data/raw', ROOT / 'docs'
manifest = json.loads((raw / 'worldbank_manifest.json').read_text())
for item in manifest:
    assert hashlib.sha256((raw / item['file']).read_bytes()).hexdigest() == item['sha256']

reserves = {}
coverage = []
for indicator in ['FI.RES.TOTL.CD', 'FI.RES.XGLD.CD']:
    response = json.loads((raw / f'worldbank_{indicator}_observations.json').read_text())
    assert response[0]['pages'] == 1 and response[0]['sourceid'] == '2'
    assert len(response[1]) == response[0]['total']
    for obs in response[1]:
        code = 'XM' if obs['country']['id'] == 'XC' else obs['country']['id']
        # World Bank uses XC/EMU for its Euro area aggregate.
        if obs['countryiso3code'] == 'EMU':
            code = 'XM'
        key = (code, int(obs['date']), indicator)
        assert key not in reserves
        reserves[key] = obs['value']

with (ROOT / 'data/processed/annual_balance_sheets.csv').open() as f:
    rows = list(csv.DictReader(f))
assert {key[0] for key in reserves} == {r['country_code'] for r in rows}
banks = []
for code in sorted({r['country_code'] for r in rows}):
    series = sorted([r for r in rows if r['country_code'] == code], key=lambda r: int(r['year']))
    base_assets = float(series[0]['assets_lcu_bn_adjusted'])
    base_fx = base_assets / float(series[0]['assets_usd_bn'])
    points = []
    previous = None
    for r in series:
        year = int(r['year'])
        local, usd = float(r['assets_lcu_bn_adjusted']), float(r['assets_usd_bn'])
        total, nongold = [reserves.get((code, year, i)) for i in ['FI.RES.TOTL.CD', 'FI.RES.XGLD.CD']]
        if total is not None and nongold is not None:
            assert total >= nongold - 1, (code, year, total, nongold)
        points.append(dict(year=year, usd=usd / 1000, gdp=float(r['assets_pct_gdp']),
            index=100 * local / base_assets, growth=None if previous is None else 100 * (local / previous - 1),
            fx=local / usd, fx_index=100 * (local / usd) / base_fx,
            reserves=None if total is None else total / 1e9,
            reserves_ex_gold=None if nongold is None else nongold / 1e9,
            gold=None if total is None or nongold is None else max(0, total - nongold) / 1e9))
        previous = local
    banks.append(dict(code=code, name=series[0]['country'], bank=series[0]['central_bank'], currency=series[0]['currency'], points=points))
    for field in ['reserves', 'reserves_ex_gold', 'gold']:
        available = [p['year'] for p in points if p[field] is not None]
        coverage.append(dict(country=series[0]['country'], measure=field, observations=len(available), first_year=min(available) if available else None, last_year=max(available) if available else None))
assert len(banks) == 24 and sum(len(b['points']) for b in banks) == 480
payload = dict(bis_date=rows[0]['retrieved_utc'][:10], reserves_date=manifest[0]['retrieved_utc'][:10], banks=banks)
out.mkdir(exist_ok=True)
(out / 'data.json').write_text(json.dumps(payload, allow_nan=False, separators=(',', ':')) + '\n')
with (ROOT / 'data/processed/reserves_coverage.csv').open('w') as f:
    writer=csv.DictWriter(f,fieldnames=coverage[0]);writer.writeheader();writer.writerows(coverage)
print('Dashboard: 24 banks, 480 annual points. Reserve coverage:')
for row in coverage:
    if row['measure']=='reserves': print(row)
