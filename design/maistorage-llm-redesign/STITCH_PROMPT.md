# Google Stitch Prompt

Paste this into Stitch with the MaiStorage logo/reference image.

## Prompt

Design a full desktop and mobile UI for a MaiStorage-branded LLM RAG workspace. This is an enterprise engineering demo for storage and AI infrastructure, not a marketing landing page.

Use MaiStorage brand colors: deep navy `#102B5C`, orange `#FF981A`, off-white/silver glass surfaces, blue-gray dividers, and dark navy text. Avoid purple AI gradients.

The interface must include:

- A glass command rail on the left with MaiStorage logo, New Chat, Search, API Keys, Projects/Notebooks, and Recents.
- A NotebookLM/Gemini-style project workspace screen where a project can contain shared sources.
- A large project heading, a source count pill, an upload source area, indexed source cards for documents/images, a project-bound chat launcher, and a past chats list.
- A chat screen with streaming messages, source chips, active project badge, model/provider badge, and a floating glass composer.
- API-key setup surface explaining that reviewers use their own key.
- Mobile responsive layout with no horizontal overflow and reduced decoration.

Visual style:

- Enterprise glassmorphism.
- Subtle WebGL-inspired storage lanes and NAND/circuit data flow in the background.
- High information density but calm spacing.
- Sharp, readable typography.
- Serious product UI, not a decorative hero page.

Interaction notes:

- Controls should look keyboard-accessible.
- Chat, project source upload, API-key settings, and recent chats must remain obvious.
- Keep animations subtle and professional.

Export goal:

Generate a wireframe/design that can be translated into the existing Next.js components without replacing the app logic.
