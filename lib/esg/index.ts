// lib/esg — ESG-модуль: коэффициенты, ввод, расчёт, существенность,
// рекомендации и сборка отчёта об устойчивом развитии.
export * from "./factors";
export * from "./input";
export * from "./compute";
export * from "./materiality";
export * from "./recommendations";
export { buildEsgReport, type EsgReportInput } from "./report";
