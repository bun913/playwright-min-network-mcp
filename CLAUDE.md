# Network Monitor MCP

## Project Overview
Network monitoring MCP tool for Playwright browser automation. Provides 3 core tools: `start_monitor`, `stop_monitor`, `get_recent_requests`.

## Technical Requirements
See `@docs/technical-requirements.md` for complete specifications.

## Development Rules
- **TDD**: Follow t-wada's TDD methodology (Red → Green → Refactor)
- **Single File**: Edit one file at a time
- **Quality Gates**: After each file modification, ALWAYS run:
  1. `npm run lint` - Check code quality
  2. `npm run format` - Format code
- **Build**: Always run `npm run build` before testing
- **Tests**: Validate all 3 tools work correctly
- **Browser**: Auto-launch Chrome with CDP on port 9222
- **Memory**: Max 200 network requests in buffer

## Implementation Priority
1. Core MCP server structure (`src/index.ts`)
2. Browser management (`src/browser.ts`)
3. Network monitoring (`src/monitor.ts`)
4. Type definitions (`src/types.ts`)

## Testing Strategy

### Test Design Principles
- **Testability**: Every function must accept required state through parameters
- **TDD Approach**: Build small functions incrementally with Red → Green → Refactor
- **BDD Structure**: Use `describe()` for SUT (System Under Test), `it()` for behavior + condition

### Unit Test Rules
- **Speed**: Use mocks/fakes for fast execution, suitable for watch mode
- **Contract Testing**: Verify promises/contracts, avoid self-fulfilling prophecies
  - ❌ `expect(body).toBe("hoge123")` when body is mocked as "hoge123"
  - ✅ `expect(request.url).include("?name=hoge123")` to verify proper parameter passing
- **Test Structure**: 
  - `describe("NetworkMonitor")` - target component
  - `it("should throw errors when required options are not given")` - behavior + condition

### System Test Requirements
- **MCP Integration**: Test actual Playwright integration for happy path scenarios
- **Real Browser**: Launch Playwright to verify network request observation
- **Console Validation**: Assert against console.log output for network capture verification
- **Minimal Coverage**: Focus on essential happy path + required option validation

## Quality Gates
- TypeScript compilation must pass
- All linting rules must pass
- Unit tests must pass (fast execution)
- System tests must pass (Playwright integration)
- All 3 MCP tools must be functional
- Network filtering must work as specified

## Architecture
- **Entry Point**: `src/index.ts`
- **Browser Control**: CDP via Playwright
- **Data Storage**: In-memory buffer
- **Output**: JSON formatted request/response data