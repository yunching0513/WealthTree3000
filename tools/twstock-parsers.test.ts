/**
 * twstockParsers.ts 單元測試(零依賴,node:assert)。
 * 執行:node tools/twstock-parsers.test.ts(Node 22.18+ 預設支援型別抹除)。
 */
import assert from 'node:assert/strict';
import {
  parseYahooChart,
  parseMisQuotes,
  parseStockDayAll,
  parseFmtqik,
  parseBfi82u,
  toNum,
  isTwMarketOpen,
} from '../src/services/twstockParsers.ts';

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    throw err;
  }
}

// ── toNum ───────────────────────────────────────────────────────

test('toNum: 千分位逗號字串', () => {
  assert.equal(toNum('1,234'), 1234);
  assert.equal(toNum('1,234,567.89'), 1234567.89);
});

test("toNum: '-' / '--' / '' / undefined → null", () => {
  assert.equal(toNum('-'), null);
  assert.equal(toNum('--'), null);
  assert.equal(toNum(''), null);
  assert.equal(toNum('   '), null);
  assert.equal(toNum(undefined), null);
  assert.equal(toNum(null), null);
});

test('toNum: 數字與負數', () => {
  assert.equal(toNum(42.5), 42.5);
  assert.equal(toNum('-3.25'), -3.25);
  assert.equal(toNum(0), 0);
  assert.equal(toNum('0'), 0);
  assert.equal(toNum(NaN), null);
  assert.equal(toNum(Infinity), null);
  assert.equal(toNum('abc'), null);
});

// ── parseYahooChart ─────────────────────────────────────────────

const yahooNormal = {
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: 23580.23,
          chartPreviousClose: 23456.78,
          regularMarketDayHigh: 23600.5,
          regularMarketDayLow: 23400.1,
          regularMarketVolume: 5432109876,
        },
        timestamp: [1752195600, 1752195660, 1752195720, 1752195780],
        indicators: {
          quote: [
            {
              open: [null, 23460.0, 23465.5, 23470.0],
              high: [23465.0, 23470.0, 23475.0, 23480.0],
              low: [23455.0, 23458.0, 23460.0, 23462.0],
              close: [23460.5, null, 23470.25, 23475.0],
              volume: [1000, 2000, null, 3000],
            },
          ],
        },
      },
    ],
    error: null,
  },
};

test('parseYahooChart: 正常回應(meta 齊全)', () => {
  const r = parseYahooChart(yahooNormal);
  assert.equal(r.price, 23580.23);
  assert.equal(r.prevClose, 23456.78);
  assert.equal(r.high, 23600.5);
  assert.equal(r.low, 23400.1);
  assert.equal(r.volume, 5432109876);
  // open = 第一個非 null 的 open
  assert.equal(r.open, 23460.0);
});

test('parseYahooChart: close 含 null → 序列跳過該點', () => {
  const r = parseYahooChart(yahooNormal);
  assert.deepEqual(r.series, [
    { t: 1752195600000, v: 23460.5 },
    { t: 1752195720000, v: 23470.25 },
    { t: 1752195780000, v: 23475.0 },
  ]);
});

test('parseYahooChart: meta 缺欄位 → 由序列回退', () => {
  const json = {
    chart: {
      result: [
        {
          meta: { chartPreviousClose: 100 },
          timestamp: [1752195600, 1752195660, 1752195720],
          indicators: {
            quote: [
              {
                open: [null, 101, 102],
                high: [103, null, 105],
                low: [99, 98.5, null],
                close: [101.5, null, 102.75],
                volume: [10, null, 20],
              },
            ],
          },
        },
      ],
    },
  };
  const r = parseYahooChart(json);
  assert.equal(r.price, 102.75); // 最後一個非 null close
  assert.equal(r.prevClose, 100);
  assert.equal(r.open, 101);
  assert.equal(r.high, 105); // max of highs
  assert.equal(r.low, 98.5); // min of lows
  assert.equal(r.volume, 30); // sum of volumes(跳過 null)
  assert.equal(r.series.length, 2);
});

test('parseYahooChart: 完全空 json → 全 null + 空 series', () => {
  for (const bad of [{}, null, undefined, [], 'x', { chart: {} }, { chart: { result: [] } }]) {
    const r = parseYahooChart(bad);
    assert.equal(r.price, null);
    assert.equal(r.prevClose, null);
    assert.equal(r.open, null);
    assert.equal(r.high, null);
    assert.equal(r.low, null);
    assert.equal(r.volume, null);
    assert.deepEqual(r.series, []);
  }
});

// ── parseMisQuotes ──────────────────────────────────────────────

const misNormal = {
  msgArray: [
    {
      c: '2330',
      n: '台積電',
      z: '1080.0000',
      y: '1075.0000',
      o: '1078.0000',
      h: '1085.0000',
      l: '1072.0000',
      v: '25123',
      t: '13:30:00',
      ex: 'tse',
    },
    {
      c: 't00',
      n: '發行量加權股價指數',
      z: '23580.23',
      y: '23456.78',
      o: '23460.00',
      h: '23600.50',
      l: '23400.10',
      v: '301873',
      t: '13:30:00',
      ex: 'tse',
    },
    {
      c: '6488',
      n: '環球晶',
      z: '520.0000',
      y: '515.0000',
      o: '516.0000',
      h: '522.0000',
      l: '514.0000',
      v: '1234',
      t: '13:30:00',
      ex: 'otc',
    },
  ],
  rtcode: '0000',
};

test('parseMisQuotes: 正常回應(tse / otc / 指數 symbol 對應)', () => {
  const qs = parseMisQuotes(misNormal);
  assert.equal(qs.length, 3);

  const tsmc = qs[0];
  assert.equal(tsmc.symbol, '2330.TW');
  assert.equal(tsmc.code, '2330');
  assert.equal(tsmc.name, '台積電');
  assert.equal(tsmc.price, 1080);
  assert.equal(tsmc.prevClose, 1075);
  assert.equal(tsmc.change, 5);
  assert.equal(tsmc.changePct, 0.47); // 5/1075*100 = 0.4651… → round2
  assert.equal(tsmc.open, 1078);
  assert.equal(tsmc.high, 1085);
  assert.equal(tsmc.low, 1072);
  assert.equal(tsmc.volume, 25123);
  assert.equal(tsmc.timeLabel, '13:30:00');

  assert.equal(qs[1].symbol, '^TWII'); // t00 → 加權指數
  assert.equal(qs[2].symbol, '6488.TWO'); // otc → .TWO
});

test("parseMisQuotes: z 為 '-'(盤中無成交)→ 退用昨收", () => {
  const json = {
    msgArray: [
      { c: '2603', n: '長榮', z: '-', y: '210.5000', o: '-', h: '-', l: '-', v: '0', t: '09:00:05', ex: 'tse' },
    ],
  };
  const qs = parseMisQuotes(json);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].price, 210.5);
  assert.equal(qs[0].prevClose, 210.5);
  assert.equal(qs[0].change, 0);
  assert.equal(qs[0].changePct, 0);
  assert.equal(qs[0].open, null);
  assert.equal(qs[0].high, null);
  assert.equal(qs[0].low, null);
});

test('parseMisQuotes: 結構錯誤 → 空陣列;缺 c 的列跳過', () => {
  assert.deepEqual(parseMisQuotes(null), []);
  assert.deepEqual(parseMisQuotes({}), []);
  assert.deepEqual(parseMisQuotes({ msgArray: 'x' }), []);
  assert.deepEqual(parseMisQuotes({ msgArray: [null, {}, { n: '無代號' }] }), []);
});

// ── parseStockDayAll ────────────────────────────────────────────

const stockDayAll = [
  {
    Code: '2330',
    Name: '台積電',
    ClosingPrice: '1,080.00',
    Change: '5.0000',
    OpeningPrice: '1,078.00',
    HighestPrice: '1,085.00',
    LowestPrice: '1,072.00',
    TradeVolume: '25,123,456',
  },
  {
    Code: '0050',
    Name: '元大台灣50',
    ClosingPrice: '203.55',
    Change: '-1.0500',
    OpeningPrice: '204.80',
    HighestPrice: '205.00',
    LowestPrice: '203.10',
    TradeVolume: '9,876,543',
  },
  {
    Code: '9999',
    Name: '不在清單',
    ClosingPrice: '10.00',
    Change: '0.10',
    OpeningPrice: '9.95',
    HighestPrice: '10.05',
    LowestPrice: '9.90',
    TradeVolume: '1,000',
  },
];

test('parseStockDayAll: 千分位逗號 + 依 codes 順序過濾', () => {
  const qs = parseStockDayAll(stockDayAll, ['0050', '2330']);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].code, '0050'); // 依 codes 順序,非資料順序
  assert.equal(qs[1].code, '2330');

  const etf = qs[0];
  assert.equal(etf.symbol, '0050.TW');
  assert.equal(etf.price, 203.55);
  assert.equal(etf.change, -1.05);
  assert.equal(etf.prevClose, 204.6); // 203.55 - (-1.05)
  assert.equal(etf.changePct, -0.51); // -1.05/204.6*100 = -0.5132… → round2
  assert.equal(etf.volume, 9876543);

  const tsmc = qs[1];
  assert.equal(tsmc.price, 1080);
  assert.equal(tsmc.prevClose, 1075);
  assert.equal(tsmc.changePct, 0.47);
  assert.equal(tsmc.volume, 25123456);
  assert.equal(tsmc.open, 1078);
});

test('parseStockDayAll: 結構錯誤 / 無匹配 → 空陣列', () => {
  assert.deepEqual(parseStockDayAll(null, ['2330']), []);
  assert.deepEqual(parseStockDayAll({}, ['2330']), []);
  assert.deepEqual(parseStockDayAll(stockDayAll, ['1101']), []);
});

// ── parseFmtqik ─────────────────────────────────────────────────

test('parseFmtqik: 取最後一列 + TradeValue 元→億 + 民國日期', () => {
  const json = [
    { Date: '1150709', TradeVolume: '7,111,222,333', TradeValue: '345,678,912,345', Transaction: '2,222,333', TAIEX: '23,456.78', Change: '88.88' },
    { Date: '1150710', TradeVolume: '6,999,888,777', TradeValue: '301,873,192,545', Transaction: '2,111,222', TAIEX: '23,580.23', Change: '123.45' },
  ];
  const r = parseFmtqik(json);
  assert.ok(r);
  assert.equal(r.date, '2026-07-10'); // 1150710 → 民國115 = 2026
  assert.equal(r.taiex, 23580.23);
  assert.equal(r.change, 123.45);
  assert.equal(r.turnoverBillions, 3018.7); // 301,873,192,545 / 1e8 → round1
});

test('parseFmtqik: 結構錯誤 → null', () => {
  assert.equal(parseFmtqik(null), null);
  assert.equal(parseFmtqik({}), null);
  assert.equal(parseFmtqik([]), null);
  assert.equal(parseFmtqik(['x']), null);
});

// ── parseBfi82u ─────────────────────────────────────────────────

test('parseBfi82u: 外資兩列相加、金額元→億、合計列忽略', () => {
  const json = [
    { 日期: '1150710', 單位名稱: '自營商(自行買賣)', 買進金額: '5,000,000,000', 賣出金額: '4,500,000,000', 買賣差額: '500,000,000' },
    { 日期: '1150710', 單位名稱: '自營商(避險)', 買進金額: '8,000,000,000', 賣出金額: '9,200,000,000', 買賣差額: '-1,200,000,000' },
    { 日期: '1150710', 單位名稱: '投信', 買進金額: '6,000,000,000', 賣出金額: '3,660,000,000', 買賣差額: '2,340,000,000' },
    { 日期: '1150710', 單位名稱: '外資及陸資(不含外資自營商)', 買進金額: '90,000,000,000', 賣出金額: '77,655,000,000', 買賣差額: '12,345,000,000' },
    { 日期: '1150710', 單位名稱: '外資自營商', 買進金額: '80,000,000', 賣出金額: '25,000,000', 買賣差額: '55,000,000' },
    { 日期: '1150710', 單位名稱: '合計', 買進金額: '109,080,000,000', 賣出金額: '95,040,000,000', 買賣差額: '14,040,000,000' },
  ];
  const r = parseBfi82u(json);
  assert.ok(r);
  assert.equal(r.date, '2026-07-10');
  assert.equal(r.foreignNet, 124.0); // (12,345,000,000 + 55,000,000) / 1e8
  assert.equal(r.trustNet, 23.4);
  assert.equal(r.dealerNet, -7.0); // 自行買賣 + 避險 兩列相加
  assert.equal(r.totalNet, 140.4); // 合計列不重複計入
});

test('parseBfi82u: 買賣差額缺失 → 退用 買進 - 賣出', () => {
  const json = [
    { 單位名稱: '外資及陸資(不含外資自營商)', 買進金額: '1,000,000,000', 賣出金額: '400,000,000' },
    { 單位名稱: '投信', 買賣差額: '-' , 買進金額: '200,000,000', 賣出金額: '500,000,000' },
  ];
  const r = parseBfi82u(json);
  assert.ok(r);
  assert.equal(r.foreignNet, 6.0);
  assert.equal(r.trustNet, -3.0);
  assert.equal(r.dealerNet, 0);
});

test('parseBfi82u: 結構錯誤 / 無可辨識列 → null', () => {
  assert.equal(parseBfi82u(null), null);
  assert.equal(parseBfi82u({}), null);
  assert.equal(parseBfi82u([]), null);
  assert.equal(parseBfi82u([{ 單位名稱: '合計', 買賣差額: '100' }]), null);
});

// ── isTwMarketOpen ──────────────────────────────────────────────
// 台北 = UTC+8(無夏令時間):以 Date.UTC 建構對應時刻。
// 2026-07-08 是週三、2026-07-11 是週六。

test('isTwMarketOpen: 台北週三 10:00 → true', () => {
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 8, 2, 0, 0))), true); // UTC 02:00 = 台北 10:00
});

test('isTwMarketOpen: 台北週三 14:00 → false(已收盤)', () => {
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 8, 6, 0, 0))), false); // UTC 06:00 = 台北 14:00
});

test('isTwMarketOpen: 台北週六 10:00 → false(假日)', () => {
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 11, 2, 0, 0))), false); // 2026-07-11 週六
});

test('isTwMarketOpen: 端點(09:00、13:30 含;08:59、13:31 不含)', () => {
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 8, 1, 0, 0))), true); // 台北 09:00
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 8, 5, 30, 0))), true); // 台北 13:30
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 8, 0, 59, 0))), false); // 台北 08:59
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 8, 5, 31, 0))), false); // 台北 13:31
});

test('isTwMarketOpen: 週日 → false', () => {
  assert.equal(isTwMarketOpen(new Date(Date.UTC(2026, 6, 12, 2, 0, 0))), false); // 2026-07-12 週日
});

console.log(`\nALL PASS (${passed} tests)`);
