// Original Japanese glyph meanings, limited to the 133 source-bound story titles.
// This is a character decoder; all names continue to come from the user's TSR.
// Source: srwf_table.tbl (CP932), SHA-256
// b052c394b9ca04c8c16faf28d1d2f96fff3bb40ce67dad24c9b30f957a2df0e0.
// The ten legacy Final charset overrides do not occur in this bounded alphabet.
// Keys match decodeEditorName: uppercase hexadecimal, one or two byte tokens.
const glyphs = new Map([
  ["00", "　"], ["11", "ー"], ["15", "！"], ["18", "Ｃ"], ["19", "Ｄ"], ["1C", "Ｇ"], ["28", "Ｓ"], ["2B", "Ｖ"],
  ["2F", "Ｚ"], ["32", "2"], ["34", "4"], ["3A", "、"], ["3B", "・"], ["3C", "（"], ["3D", "）"], ["41", "あ"],
  ["43", "い"], ["45", "う"], ["47", "え"], ["49", "お"], ["4A", "か"], ["4B", "が"], ["4C", "き"], ["4E", "く"],
  ["4F", "ぐ"], ["52", "こ"], ["54", "さ"], ["55", "ざ"], ["56", "し"], ["58", "す"], ["59", "ず"], ["5A", "せ"],
  ["5C", "そ"], ["5E", "た"], ["5F", "だ"], ["60", "ち"], ["63", "つ"], ["65", "て"], ["66", "で"], ["67", "と"],
  ["69", "な"], ["6A", "に"], ["6D", "の"], ["6E", "は"], ["6F", "ば"], ["72", "び"], ["77", "へ"], ["7D", "ま"],
  ["7E", "み"], ["80", "め"], ["87", "よ"], ["88", "ら"], ["89", "り"], ["8A", "る"], ["8B", "れ"], ["8C", "ろ"],
  ["8D", "わ"], ["8E", "を"], ["90", "ァ"], ["91", "ア"], ["92", "ィ"], ["93", "イ"], ["95", "ウ"], ["96", "ェ"],
  ["97", "エ"], ["99", "オ"], ["9A", "カ"], ["9B", "ガ"], ["9C", "キ"], ["9D", "ギ"], ["9E", "ク"], ["9F", "グ"],
  ["A0", "ケ"], ["A1", "ゲ"], ["A2", "コ"], ["A3", "ゴ"], ["A4", "サ"], ["A5", "ザ"], ["A6", "シ"], ["A7", "ジ"],
  ["A8", "ス"], ["A9", "ズ"], ["AA", "セ"], ["AC", "ソ"], ["AE", "タ"], ["AF", "ダ"], ["B0", "チ"], ["B2", "ッ"],
  ["B5", "テ"], ["B6", "デ"], ["B7", "ト"], ["B8", "ド"], ["B9", "ナ"], ["BA", "ニ"], ["BC", "ネ"], ["BD", "ノ"],
  ["BE", "ハ"], ["BF", "バ"], ["C0", "パ"], ["C1", "ヒ"], ["C2", "ビ"], ["C3", "ピ"], ["C4", "フ"], ["C5", "ブ"],
  ["C6", "プ"], ["C8", "ベ"], ["C9", "ペ"], ["CB", "ボ"], ["CC", "ポ"], ["CD", "マ"], ["CE", "ミ"], ["CF", "ム"],
  ["D1", "モ"], ["D2", "ャ"], ["D6", "ョ"], ["D7", "ヨ"], ["D8", "ラ"], ["D9", "リ"], ["DA", "ル"], ["DB", "レ"],
  ["DC", "ロ"], ["DD", "ワ"], ["DF", "ン"], ["E0", "ヴ"], ["E3", "＝"], ["EBF2", "．．"], ["EBF3", "！！"], ["EBF4", "！？"],
  ["EC03", "流"], ["EC06", "神"], ["EC12", "南"], ["EC16", "大"], ["EC1C", "破"], ["EC1E", "万"], ["EC1F", "丈"], ["EC20", "剣"],
  ["EC23", "炎"], ["EC2C", "力"], ["EC32", "野"], ["EC34", "日"], ["EC38", "時"], ["EC3B", "突"], ["EC40", "場"], ["EC49", "士"],
  ["EC4B", "超"], ["EC4F", "海"], ["EC51", "動"], ["EC52", "戦"], ["EC53", "闘"], ["EC54", "攻"], ["EC55", "撃"], ["EC57", "命"],
  ["EC5F", "第"], ["EC63", "限"], ["EC65", "反"], ["EC6F", "地"], ["EC70", "上"], ["EC71", "回"], ["EC74", "体"], ["EC79", "能"],
  ["EC7B", "防"], ["EC7C", "御"], ["EC7D", "修"], ["EC82", "国"], ["EC83", "光"], ["EC84", "子"], ["EC86", "望"], ["EC8C", "行"],
  ["EC93", "敵"], ["EC95", "月"], ["EC97", "研"], ["EC98", "究"], ["EC99", "所"], ["ECA0", "暗"], ["ECA4", "将"], ["ECA5", "軍"],
  ["ECA8", "方"], ["ECB0", "解"], ["ECB2", "壊"], ["ECB4", "熱"], ["ECB5", "対"], ["ECB6", "空"], ["ECB8", "高"], ["ECBF", "死"],
  ["ECC1", "山"], ["ECC2", "発"], ["ECCD", "激"], ["ECCF", "謀"], ["ECD3", "獣"], ["ECD4", "魔"], ["ECDA", "名"], ["ECDC", "火"],
  ["ECDF", "理"], ["ECE1", "機"], ["ECE4", "終"], ["ECE7", "隊"], ["ECED", "敗"], ["ECF7", "合"], ["ECF8", "前"], ["ECF9", "果"],
  ["ECFC", "血"], ["ED00", "愛"], ["ED02", "情"], ["ED04", "使"], ["ED05", "決"], ["ED06", "定"], ["ED07", "別"], ["ED08", "手"],
  ["ED09", "無"], ["ED0C", "的"], ["ED0F", "可"], ["ED11", "平"], ["ED14", "砂"], ["ED15", "市"], ["ED1A", "面"], ["ED22", "出"],
  ["ED2B", "生"], ["ED30", "目"], ["ED36", "始"], ["ED3B", "意"], ["ED3D", "結"], ["ED3E", "構"], ["ED40", "影"], ["ED4B", "後"],
  ["ED4E", "一"], ["ED4F", "逃"], ["ED51", "不"], ["ED56", "陰"], ["ED57", "現"], ["ED59", "来"], ["ED60", "間"], ["ED62", "狙"],
  ["ED67", "特"], ["ED6A", "囲"], ["ED6C", "我"], ["ED71", "断"], ["ED73", "問"], ["ED87", "都"], ["ED9C", "悪"], ["EDA0", "襲"],
  ["EDA2", "成"], ["EDA6", "運"], ["EDA8", "救"], ["EDA9", "入"], ["EDAF", "立"], ["EDB0", "刻"], ["EDB2", "伝"], ["EDB5", "乱"],
  ["EDC1", "説"], ["EDC5", "未"], ["EDC7", "危"], ["EDCB", "和"], ["EDD3", "侵"], ["EDD8", "家"], ["EDDB", "再"], ["EDE3", "旗"],
  ["EDE7", "由"], ["EDF2", "者"], ["EDF5", "集"], ["EDFB", "追"], ["EE05", "東"], ["EE10", "新"], ["EE18", "呼"], ["EE23", "奪"],
  ["EE3D", "過"], ["EE3E", "去"], ["EE55", "赤"], ["EE59", "復"], ["EE5A", "讐"], ["EE67", "会"], ["EE79", "招"], ["EE90", "協"],
  ["EE9B", "恐"], ["EEA0", "瞬"], ["EEA1", "質"], ["EEA6", "逆"], ["EEB4", "怖"], ["EEBC", "劇"], ["EEBD", "非"], ["EEBF", "覚"],
  ["EEC1", "想"], ["EEC3", "裏"], ["EECD", "切"], ["EED1", "異"], ["EED3", "実"], ["EED5", "包"], ["EED8", "完"], ["EEE0", "亡"],
  ["EEE3", "悲"], ["EEF5", "像"], ["EEF9", "訓"], ["EF05", "客"], ["EF06", "霊"], ["EF11", "王"], ["EF29", "登"], ["EF36", "陽"],
  ["EF55", "偽"], ["EF5F", "髮"], ["EF63", "驚"], ["EF67", "封"], ["EF6E", "震"], ["EF71", "図"], ["EF80", "派"], ["EF8E", "翻"],
  ["EFA3", "衝"], ["EFA4", "刺"], ["EFC2", "崩"], ["EFCD", "雲"], ["EFEF", "印"], ["EFF2", "閣"], ["EFFB", "訣"], ["EFFD", "徒"],
  ["F007", "雪"], ["F00D", "宇"], ["F00E", "宙"], ["F00F", "嵐"], ["F01C", "京"], ["F02D", "輪"], ["F041", "網"], ["F044", "浮"],
  ["F05A", "謎"], ["F05B", "偶"], ["F09D", "標"], ["F0B3", "訪"], ["F0DC", "歌"], ["F0E4", "算"], ["F127", "清"], ["F13D", "錯"],
  ["F17C", "挽"], ["F18F", "虚"], ["F190", "暮"], ["F1C7", "曲"], ["F1CC", "刃"], ["F1F1", "僕"], ["F49D", "紡"], ["F49E", "凱"],
  ["F49F", "楼"], ["F4A0", "叛"], ["F4A1", "綜"], ["F4BD", "序"], ["F4EE", "灯"], ["F568", "塗"], ["F58C", "狹"], ["F5A9", "慌"],
]);

const fCodes = (
  "00 11 15 18 19 1C 28 2B 2F 3A 3B 3C 3D 49 4A 52 56 5A 5C 5E 60 67 6D 6E " +
  "72 77 80 87 88 89 8A 8B 8C 8D 8E 90 91 93 96 97 99 9B 9C 9E 9F A1 A2 A3 " +
  "A4 A5 A6 A7 A8 AA AE AF B0 B2 B5 B6 B7 B8 B9 BA BC BE BF C1 C2 C3 C4 C5 " +
  "C8 C9 CB CC CD CE CF D2 D6 D8 D9 DA DB DC DF E0 E3 EBF3 EBF4 EC03 EC06 EC12 EC16 EC1C " +
  "EC2C EC32 EC3B EC40 EC4B EC4F EC51 EC52 EC53 EC55 EC65 EC70 EC71 EC74 EC79 EC83 EC84 EC86 EC93 EC97 EC98 EC99 ECA0 ECA4 " +
  "ECA5 ECA8 ECB4 ECB5 ECB6 ECBF ECC1 ECCF ECD3 ECDA ECE1 ECE7 ECED ECF7 ECF8 ECFC ED02 ED04 ED05 ED0C ED0F ED11 ED22 ED30 " +
  "ED36 ED3B ED40 ED4B ED4E ED51 ED56 ED57 ED59 ED62 ED67 ED6A EDA0 EDA2 EDA8 EDA9 EDAF EDC7 EDCB EDD3 EDDB EE05 EE23 EE67 " +
  "EEA6 EEBC EEBD EEBF EEC3 EECD EED1 EED5 EEE3 EEF9 EF05 EF29 EF5F EF63 EF80 EFA3 EFA4 EFCD EFFD F007 F00D F00E F041 F044 " +
  "F05A F09D"
).split(" ");
const finalCodes = (
  "00 11 15 32 34 3A 3B 3C 3D 41 43 45 47 4A 4B 4C 4E 4F 54 55 56 58 59 5C " +
  "5E 5F 60 63 65 66 67 69 6A 6D 6E 6F 77 7D 7E 87 88 89 8A 8B 8D 8E 90 91 " +
  "92 93 95 96 97 99 9A 9B 9D 9E 9F A0 A3 A4 A5 A6 A7 A8 A9 AC AE AF B2 B5 " +
  "B6 B7 B8 B9 BC BD BE BF C0 C2 C4 C5 C6 C9 CB CD CE CF D1 D6 D7 D8 D9 DA " +
  "DB DC DD DF EBF2 EBF3 EBF4 EC16 EC1C EC1E EC1F EC20 EC23 EC2C EC32 EC34 EC38 EC40 EC49 EC4B EC51 EC52 EC53 EC54 " +
  "EC55 EC57 EC5F EC63 EC6F EC70 EC7B EC7C EC7D EC82 EC83 EC86 EC8C EC95 EC99 ECB0 ECB2 ECB8 ECC2 ECCD ECD4 ECDA ECDC ECDF " +
  "ECE1 ECE4 ECED ECF8 ECF9 ECFC ED00 ED05 ED06 ED07 ED08 ED09 ED14 ED15 ED1A ED22 ED2B ED36 ED3B ED3D ED3E ED4B ED4F ED57 " +
  "ED60 ED6C ED71 ED73 ED87 ED9C EDA2 EDA6 EDA8 EDAF EDB0 EDB2 EDB5 EDC1 EDC5 EDC7 EDD8 EDE3 EDE7 EDF2 EDF5 EDFB EE05 EE10 " +
  "EE18 EE3D EE3E EE55 EE59 EE5A EE79 EE90 EE9B EEA0 EEA1 EEB4 EEC1 EEC3 EECD EED1 EED3 EED8 EEE0 EEE3 EEF5 EF06 EF11 EF36 " +
  "EF55 EF67 EF6E EF71 EF8E EFC2 EFEF EFF2 EFFB F00D F00E F00F F01C F02D F05B F0B3 F0DC F0E4 F127 F13D F17C F18F F190 F1C7 " +
  "F1CC F1F1 F49D F49E F49F F4A0 F4A1 F4BD F4EE F568 F588 F58C F5A9"
).split(" ");

// Final stock root[22] cells 169, 179 and 180 contain the single glyph F588.
// Their native selector table entries are all 125, selecting EFFECT 299/16.
// That source title graphic is the kanji below; the legacy table left F588
// as an unresolved placeholder. This correction is confined to Final.
export const F_STOCK_SCENARIO_NAME_MAP = new Map(fCodes.map(code => [code, glyphs.get(code)]));
export const FINAL_STOCK_SCENARIO_NAME_MAP = new Map(finalCodes.map(code => [code,
  code === "F588" ? "絆" : glyphs.get(code),
]));
