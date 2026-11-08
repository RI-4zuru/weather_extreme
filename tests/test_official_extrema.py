import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fetch_official_extrema import SOURCES, parse_minute, parse_source, update


def data_line(spec, value, quality=8, time_quality=8, station=62078):
    fields, resolution = spec[1], spec[2]
    row = [''] * 42
    row[:9] = [str(station), '大阪府', '大阪', '', '2026', '11', '08', '16', '00']
    v, q, h, m, tq = fields
    row[v] = str(value); row[q] = str(quality)
    if h is not None: row[h] = '14'
    if m is not None: row[m] = '23'
    if tq is not None: row[tq] = str(time_quality)
    return ','.join(row)


class OfficialExtremaTest(unittest.TestCase):
    def test_minute_conversion(self):
        self.assertEqual(parse_minute('2026-11-08','14','23'),'2026-11-08T14:23+09:00')
        self.assertIsNone(parse_minute('2026-11-08','24','10'))

    def test_all_documented_field_indices(self):
        for key, spec in SOURCES.items():
            url,fields,resolution=spec
            parsed=parse_source('観測所番号,都道府県,\n'+data_line(spec,17.2),key,fields,'2026-11-08',resolution)
            with self.subTest(key=key):
                self.assertEqual(parsed['62078']['value'],17.2)
                self.assertEqual(parsed['62078']['observedAt'],
                    '2026-11-08T16:00+09:00' if resolution=='official-asof' else '2026-11-08T14:23+09:00')
                self.assertEqual(parsed['62078']['publishedAt'],'2026-11-08T16:00+09:00')
                self.assertEqual(parsed['62078']['sourceResolution'],resolution)

    def test_temp_no_time_quality_and_rain_with_time_quality(self):
        temp=SOURCES['dailyMaxTemp']
        self.assertIsNone(temp[1][-1], 'JMA maximum-temperature format has no time-quality column')
        self.assertEqual(SOURCES['dailyMinTemp'][1][-1],13)
        self.assertIn('62078',parse_source(data_line(temp,35),temp[0],temp[1],'2026-11-08',temp[2]))
        rain=SOURCES['max1hPrecip']
        self.assertFalse(parse_source(data_line(rain,35,time_quality=3),rain[0],rain[1],'2026-11-08',rain[2]))
        self.assertFalse(parse_source(data_line(rain,35,quality=4),rain[0],rain[1],'2026-11-08',rain[2]))

    def test_quality_wrong_day_excluded(self):
        spec=SOURCES['dailyMaxTemp']
        self.assertFalse(parse_source(data_line(spec,35,quality=4),spec[0],spec[1],'2026-11-08',spec[2]))
        self.assertFalse(parse_source(data_line(spec,35),spec[0],spec[1],'2026-11-09',spec[2]))
        self.assertTrue(parse_source(data_line(spec,35,quality=5),spec[0],spec[1],'2026-11-08',spec[2]))

    def test_partial_failure_retains_other_fields_and_recovers(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'official_extrema.json'
            def fetch(url):
                if 'gust00' in url: raise ValueError('JMA temporarily unavailable')
                for key, spec in SOURCES.items():
                    if url==spec[0]: return '観測所番号,テスト\n'+data_line(spec,9.8)
                raise ValueError(url)
            data=update(output_path=path,today='2026-11-08',fetcher=fetch)
            self.assertEqual(data['stations']['62078']['dailyMaxTemp']['value'],9.8)
            self.assertEqual(data['stations']['62078']['max72hPrecip']['value'],9.8)
            self.assertNotIn('dailyMaxGust',data['stations']['62078'])
            self.assertEqual(len(data['sources']),len(SOURCES)-1)
            self.assertTrue(path.exists())
            def fetch_missing(url):
                if 'pre1h00' in url: raise ValueError('temporary')
                for key,spec in SOURCES.items():
                    if url==spec[0]: return 'test\n'+data_line(spec,2.5)
                raise ValueError(url)
            recovered=update(output_path=path,today='2026-11-08',fetcher=fetch_missing)
            self.assertEqual(recovered['stations']['62078']['max1hPrecip']['value'],9.8)

if __name__=='__main__':unittest.main()
