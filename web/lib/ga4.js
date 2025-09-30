// /workspaces/insightsgpt/web/lib/ga4.js
export function buildDimensionFilter(filters = {}) {
  const exprs = [];

  // Device (single value)
  if (filters.device) {
    exprs.push({
      filter: {
        fieldName: "deviceCategory",
        stringFilter: { matchType: "EXACT", value: filters.device, caseSensitive: false },
      },
    });
  }

  // Countries (array of strings)
  if (Array.isArray(filters.countries) && filters.countries.length > 0) {
    exprs.push({
      filter: {
        fieldName: "country",
        inListFilter: { values: filters.countries, caseSensitive: false },
      },
    });
  }

  // Channel Groups (array of strings)
  if (Array.isArray(filters.channelGroups) && filters.channelGroups.length > 0) {
    exprs.push({
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        inListFilter: { values: filters.channelGroups, caseSensitive: false },
      },
    });
  }

  if (exprs.length === 0) return undefined; // no filter
  return { andGroup: { expressions: exprs } };
}
