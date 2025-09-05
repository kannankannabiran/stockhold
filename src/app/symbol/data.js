const rawList =[

  { value: "SMLISUZU.NS", label: "SMLISUZU" },
];

const stocklist = Array.from(new Map(rawList.map(s => [s.value, s])).values());

export default stocklist;
