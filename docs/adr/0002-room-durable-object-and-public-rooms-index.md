# One Durable Object per Room, with a D1 index of Public Rooms

Each Room is a Durable Object that owns its Matches, Seats, timers and WebSockets, so simultaneous guesses are serialised without locks. Because no Room can see another, the main site's Public Room list reads a D1 `public_rooms` table that each Room upserts when its headcount changes and deletes when it closes. We chose this over a single directory Durable Object: D1 is simple to query and sort, and a few writes per join or leave are cheap at this scale.
