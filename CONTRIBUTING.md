# Contributing

Focus Gram is an Instagram client with focus controls. Keep the interface small. Use external editors for media editing.

Run `npm test`, `npm run test:stories`, `npm run test:ui`, and `npm run build`. Native changes should also run `npm run test:desktop` in a Linux desktop session. Tests must use isolated fixtures and must not publish to a real account.

Preserve the sandbox, separate Instagram session, and narrow IPC boundary. Never expose cookies to the React renderer or put credentials into logs or process arguments. Don't add automatic login retries or silent publication. Changes to the experimental Story integration must keep the acknowledgement and uncertainty handling.

For focus filtering, preserve login fields, Story viewers, messages and creation flows. Include representative DOM fixtures when changing selectors.
