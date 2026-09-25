# Scenarios: opt into general knowledge or a web search

- [x] Neither flag set: reply stays grounded on the item's own content only (unchanged behavior)
- [x] `allowGeneralKnowledge: true`: agent may answer from general knowledge when the item doesn't cover it
- [x] `allowWebSearch: true`: agent can call the web-search tool and cites a real, non-invented url
- [x] `allowWebSearch: false` or omitted: no search tool is attached to the agent at all
- [x] Both flags omitted from the request body: schema still validates, defaults to false/false
