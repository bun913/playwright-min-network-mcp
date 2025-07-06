# playwright-min-network-mcp

A minimal network monitoring MCP tool for Playwright browser automation

## Features

- Network request/response monitoring via Chrome DevTools Protocol
- Smart filtering to focus on API calls and meaningful traffic
- Works with existing Playwright browser instances or launches new ones
- Customizable filtering options

## Usage Examples

### Basic Usage

```json
// Start monitoring (launches visible browser by default)
{
  "tool": "start_monitor"
}

// Get recent network requests
{
  "tool": "get_recent_requests",
  "arguments": {
    "count": 50
  }
}
```

### Advanced Filtering with custom_filter

The `custom_filter` allows you to override default filtering with custom rules. It works in addition to `auto_filter` when both are enabled.

**Filter Priority:**
1. `include_url_patterns` (whitelist) - takes precedence
2. `exclude_url_patterns` (blacklist) - applied after include
3. `content_types` - replaces default content types when specified

```json
// Start with custom filters
{
  "tool": "start_monitor",
  "arguments": {
    "auto_filter": true,
    "custom_filter": {
      "include_url_patterns": [
        "api\\.github\\.com",
        "graphql",
        ".*\\.amazonaws\\.com"
      ],
      "exclude_url_patterns": [
        "google-analytics",
        "\\.(css|js|png|jpg)$",
        "tracking"
      ],
      "content_types": [
        "application/json",
        "application/x-www-form-urlencoded"
      ]
    }
  }
}

// Filter when retrieving requests
{
  "tool": "get_recent_requests",
  "arguments": {
    "count": 30,
    "filter": {
      "methods": ["POST", "PUT", "DELETE"],
      "url_pattern": "api\\.example\\.com",
      "content_type": ["application/json"]
    }
  }
}
```

**Custom Filter Examples:**

```json
// Only capture GitHub API calls
{
  "custom_filter": {
    "include_url_patterns": ["api\\.github\\.com"]
  }
}

// Capture all except analytics and static files
{
  "custom_filter": {
    "exclude_url_patterns": ["analytics", "\\.(css|js|png)$"]
  }
}

// Only JSON and XML responses
{
  "custom_filter": {
    "content_types": ["application/json", "application/xml"]
  }
}
```

## Filter Pattern Notes

- **URL Patterns**: Use regex patterns. Remember to escape dots with `\\.`
- **Content Types**: Exact matches for Content-Type headers
- **Auto Filter**: When enabled (default), excludes common static assets and includes API-related content types

## Smart Default Filtering (auto_filter)

When `auto_filter` is enabled (default: true), smart filtering is applied to focus on meaningful API communications:

**Excluded URL patterns:**
- Static files: `\.(css|js|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)(\?|$)`
- CDN assets: `githubassets.com.*\.(css|js|png|svg|woff)`
- Analytics: `google-analytics.com`, `googletagmanager.com`

**Included Content-Types:**
- `application/json`
- `application/x-www-form-urlencoded`
- `multipart/form-data`
- `text/plain`

**What gets captured:**
- ✅ GitHub API (`api.github.com`)
- ✅ GraphQL endpoints
- ✅ S3 uploads (`*.amazonaws.com`)
- ✅ Form submissions
- ✅ AJAX communications

## Configuration Options

### start_monitor

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_buffer_size` | number | 200 | Maximum number of requests to store |
| `auto_filter` | boolean | true | Apply smart default filtering (excludes static files, includes API communications) |
| `headless` | boolean | false | Run browser in headless mode |
| `cdp_port` | number | 9222 | Chrome DevTools Protocol port |
| `custom_filter` | object | - | Custom filter configuration |

### get_recent_requests

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `count` | number | 30 | Number of requests to return |
| `filter` | object | - | Filter criteria |
| `include_body` | boolean | true | Include request/response bodies |

## MCP Configuration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "network-monitor": {
      "command": "npx",
      "args": ["playwright-min-network-mcp"]
    }
  }
}
```

For use with Playwright MCP:

```json
{
  "mcpServers": {
    "network-monitor": {
      "command": "npx",
      "args": ["playwright-min-network-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp", "--cdp-endpoint", "http://localhost:9222"]
    }
  }
}
```