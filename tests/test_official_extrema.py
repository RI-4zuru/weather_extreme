import sys
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fetch_official_extrema import SOURCES, parse_minute, parse_source, update


def data_line(indices, value, quality=8, time_quality=8, station=62078):
    row=['']*32
    row[:9]=[str(station),'大阪府','大阪','','2026','11','08','16','00']
    v,q,h,m,tq=indices
    row[v]=str(value);row[q]=str(quality);row[h]='14';row[m]='23';row[tq]=str(time_quality)
    return ','.join(row)


class OfficialExtremaTest(unittest.TestCase):
    def test_minute_conversion(self):
        self.assertEqual(parse_minute('2026-11-08','14','23'),'2026-11-08T14:23+09:00')
        self.assertIsNone(parse_minute('2026-11-08','24','10'))

    def test_all_documented_field_indices(self):
        for key, (url, fields) in SOURCES.items():
            parsed=parse_source('観測所番号,都道府県,\n'+data_line(fields,17.2),'test',fields,'2026-11-08')
            self.assertEqual(parsed['62078']['value'],17.2,key)
            self.assertEqual(parsed['62078']['observedAt'],'2026-11-08T14:23+09:00',key)
            self.assertEqual(parsed['62078']['publishedAt'],'2026-11-08T16:00+09:00',key)

    def test_quality_and_wrong_day_excluded(self):
        i=SOURCES['dailyMaxTemp'][1]
        self.assertFalse(parse_source(data_line(i, 35, quality=4),'test',i,'2026-11-08'))
        self.assertFalse(parse_source(data_line(i, 35, time_quality=3),'test',i,'2026-11-08'))
        self.assertFalse(parse_source(data_line(i, 35),'test',i,'2026-11-09'))
        self.assertTrue(parse_source(data_line(i, 35, quality=5),'test',i,'2026-11-08'))

    def test_update_partial_failure_keeps_other_current_day_data(self):
        with tempfile.TemporaryDirectory() as folder:
            output=Path(folder)/'official_extrema.json'
            def fetch(url):
                if 'gust00' in url: raise ValueError('JMA temporarily unavailable')
                for key, (path, indices) in SOURCES.items():
                    if url==path: return '観測所番号,テスト\n'+data_line(indices,9.8)
                raise ValueError(url)
            data=update(output_path=output,today='2026-11-08',fetcher=fetch)
            self.assertEqual(data['stations']['62078']['dailyMaxTemp']['value'],9.8)
            self.assertNotIn('dailyMaxGust',data['stations']['62078'])
            self.assertEqual(len(data['sources']),4)
            self.assertTrue(output.exists())


if __name__=='__main__':
    unittest.main()
