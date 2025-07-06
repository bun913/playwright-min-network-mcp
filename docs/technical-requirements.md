# Network Monitor MCP - Technical Requirements

## Overview
An MCP tool that monitors and analyzes browser network communications in collaboration with Playwright MCP. Specifically designed for SDET tasks including API test implementation, data validation, and bug investigation.

## Architecture
- **Browser Management**: Auto-launch and connect via CDP port 9222
- **Data Storage**: In-memory buffer (max 200 entries)
- **Filtering**: Smart defaults + customizable filters
- **Output**: On-demand detailed information retrieval

## Provided Tools

### 1. `start_monitor`
**Function**: Start network monitoring, auto-launch browser

**Arguments**:
```typescript
{
  max_buffer_size?: number,     // Default: 200
  cdp_port?: number,            // Default: 9222
  filter?: {
    content_types?: string[] | "all"    // Default: ["application/json", "application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]
                                        // "all" = include all content types (including CSS, JS, images)
                                        // [] = include nothing
  }
}
```

### 2. `stop_monitor`
**Function**: Stop network monitoring

**Arguments**: None

### 3. `get_recent_requests`
**Function**: Retrieve detailed information of recent requests

**Arguments**:
```typescript
{
  count?: number,               // Default: 30, Max: 200
  filter?: {
    methods?: string[],         // Default: ["POST", "PUT", "PATCH", "DELETE", "GET"]
    url_pattern?: string,       // Regular expression
    content_type?: string[]     // Default: ["application/json", "application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]
  },
  include_body?: boolean        // Default: true
}
```

## Default Filter Configuration

### Default Included Content-Types
- `application/json` - API responses
- `application/x-www-form-urlencoded` - Form submissions  
- `multipart/form-data` - File uploads
- `text/plain` - Analytics and simple text data

### Special Values
- `"all"` - Include all content types (CSS, JS, images, etc.)
- `[]` - Include nothing (disable monitoring)

### Content-Type Examples
- **Static Files**: `text/css`, `application/javascript`, `image/png`, `image/svg+xml`
- **API Data**: `application/json`, `application/xml`
- **Forms**: `application/x-www-form-urlencoded`, `multipart/form-data`

### Included Communication Examples
- ✅ GitHub API (`api.github.com`)
- ✅ GraphQL endpoints
- ✅ S3 uploads (`*.amazonaws.com`)
- ✅ Form submissions
- ✅ AJAX communications

## Output Format

### `get_recent_requests` Response
```json
{
  "total_captured": 156,
  "showing": 30,
  "requests": [
    {
      "id": 1,
      "timestamp": "2025-01-06T12:34:56Z",
      "method": "POST",
      "url": "https://api.github.com/graphql",
      "request": {
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer ..."
        },
        "body": "{\"query\": \"...\"}"
      },
      "response": {
        "status": 200,
        "headers": {
          "Content-Type": "application/json"
        },
        "body": "{\"data\": {...}}"
      }
    }
  ]
}
```

## Technical Implementation

### Required Technologies
- **Language**: TypeScript
- **Framework**: `@modelcontextprotocol/sdk`
- **Browser Control**: `playwright` (CDP functionality)
- **Package Management**: npm

### File Structure
```
network-monitor-mcp/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── browser.ts        # Browser launch and management
│   ├── monitor.ts        # Network monitoring and filtering
│   └── types.ts          # TypeScript type definitions
├── package.json
├── tsconfig.json
└── README.md
```

## Usage Examples

### .mcp.json Configuration
```json
{
  "mcpServers": {
    "network-monitor": {
      "command": "npx",
      "args": ["@your-org/network-monitor-mcp@latest"]
    },
    "playwright": {
      "command": "npx", 
      "args": ["@playwright/mcp@latest", "--cdp-endpoint", "http://localhost:9222"]
    }
  }
}
```

### Basic Usage Flow
```
1. start_monitor                                    # Default: JSON/form data only
2. start_monitor --filter.content_types="all"      # Include CSS, JS, images
3. start_monitor --filter.content_types=[]         # Include nothing
4. [Browser operations with Playwright MCP]
5. get_recent_requests
6. get_recent_requests --filter.url_pattern="api\."
7. stop_monitor
```

## Design Principles
- **Simple**: Only 3 tools
- **Efficient**: Minimize context pressure
- **Practical**: Specialized filtering for SDET work
- **Flexible**: Custom filter support
- **Independent**: Combinable with other MCP tools

## Use Cases

### 1. API Test Implementation
1. Start network monitoring with `start_monitor`
2. Operate web application with Playwright MCP
3. Get API request/response details with `get_recent_requests`
4. Implement API test code based on captured information

### 2. Data Validation
1. Compare data structures between frontend and backend
2. Verify correspondence between server-side terms and UI display terms
3. Validate response data integrity

### 3. Bug Investigation
1. Identify discrepancies between expected and actual API responses
2. Analyze network error details
3. Investigate authentication and authorization issues