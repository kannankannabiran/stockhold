import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"]
});

export default yahooFinance;
