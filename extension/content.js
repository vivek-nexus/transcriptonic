// @ts-check
/// <reference path="../types/chrome.d.ts" />
/// <reference path="../types/index.js" />


//*********** GLOBAL VARIABLES **********//
/** @type {ExtensionStatusJSON} */
const extensionStatusJSON_bug = {
  "status": 400,
  "message": `<strong>WindsurfOnsiteDemo encountered a new error</strong> <br /> Please report it <a href="https://github.com/vivek-nexus/transcriptonic/issues" target="_blank">here</a>.`
}

const reportErrorMessage = "There is a bug in WindsurfOnsiteDemo. Please report it at https://github.com/vivek-nexus/transcriptonic/issues"
/** @type {MutationObserverInit} */
const mutationConfig = { childList: true, attributes: true, subtree: true, characterData: true }

// Name of the person attending the meeting
let userName = "You"

// Transcript array that holds one or more transcript blocks
/** @type {TranscriptBlock[]} */
let transcript = []

// Buffer variables to dump values, which get pushed to transcript array as transcript blocks, at defined conditions
let personNameBuffer = "", transcriptTextBuffer = "", timestampBuffer = ""

// Chat messages array that holds one or more chat messages of the meeting
/** @type {ChatMessage[]} */
let chatMessages = []

// Capture meeting start timestamp, stored in ISO format
let meetingStartTimestamp = new Date().toISOString()
let meetingTitle = document.title

// Capture invalid transcript and chatMessages DOM element error for the first time and silence for the rest of the meeting to prevent notification noise
let isTranscriptDomErrorCaptured = false
let isChatMessagesDomErrorCaptured = false

// Capture meeting begin to abort userName capturing interval
let hasMeetingStarted = false

// Capture meeting end to suppress any errors
let hasMeetingEnded = false

/** @type {ExtensionStatusJSON} */
let extensionStatusJSON

let canUseAriaBasedTranscriptSelector = true

// === TRANSCRIPT OVERLAY PANEL ===
let transcriptOverlayDiv = null

function ensureTranscriptOverlay() {
  if (!transcriptOverlayDiv) {
    transcriptOverlayDiv = document.createElement('div')
    transcriptOverlayDiv.setAttribute('id', 'windsurf-transcript-overlay')
    transcriptOverlayDiv.setAttribute('aria-live', 'polite')
    transcriptOverlayDiv.style.cssText = `
      position: fixed;
      top: 4%; /* position near very top for minimal visibility */
      left: 50%;
      transform: translateX(-50%);
      min-width: 480px;
      max-width: 80vw;
      min-height: 64px;
      max-height: 60vh;
      background: rgba(20, 30, 40, 0.60);
      color: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 32px rgba(0,0,0,0.18);
      padding: 2rem 2.5rem;
      z-index: 2147483647;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 1.25rem;
      line-height: 1.7;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      pointer-events: none;
      opacity: 0.92;
      transition: opacity 0.2s;
      user-select: text;
      overflow-y: auto;
    `
    transcriptOverlayDiv.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:1rem;width:100%;">
        <span style="margin-top:0.2em;flex-shrink:0;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f7b731" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/></svg>
        </span>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:1.18em;color:#fff;margin-bottom:0.3em;letter-spacing:0.01em;">Transcript</div>
          <div id="windsurf-transcript-text" style="font-size:1.08em;color:#d6d6d6;line-height:1.7;max-width:100%;word-break:break-word;"></div>
        </div>
      </div>
    `
    document.body.appendChild(transcriptOverlayDiv)
  }
}

// === SALES ASSISTANT QUESTION DETECTION ===
// Global system prompt shared by all OpenAI calls

// Place your OpenAI API key here (do NOT commit to public repos)
async function getOpenAIApiKey() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['OPENAI_API_KEY'], (result) => {
        resolve(result.OPENAI_API_KEY || null);
      });
    } else {
      // Not running as a Chrome extension context
      resolve(null);
    }
  });
}

let lastQuestion = '';
let lastAnswer = '';
let windsurfContext = '';
let answerTimer = null;
let lastAnswerTimestamp = 0;

// Track questions we've already answered to avoid duplicate API calls
const answeredQuestions = new Set();

// High-signal sales keywords/phrases for filtering
// const SALES_KEYWORDS = [...]; // (deleted)

// Helper: Is this a high-signal sales question?
// function isHighSignalSalesQuestion(text) { ... } // (deleted)

async function getOpenAIAnswer(question, contextSnippet) {
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) {
    console.error("OpenAI API key not found.");
    return "Error: OpenAI API key not found.";
  }
  const context = `# Windsurf (Formerly Codeium) Overview

**Windsurf** is an AI-powered coding platform designed to enhance developer productivity through an agentic IDE and plugins. Launched as Exafunction in 2021, rebranded to Codeium in 2022, and officially renamed Windsurf in April 2025, the company combines human and machine capabilities to create a seamless "flow state" for developers. Windsurf offers tools for individuals and enterprises, emphasizing security, scalability, and intuitive AI integration.

**Promotion**: Free unlimited access to GPT-4.1 and o4-mini models from April 14 to April 21, 2025.

---

## Products and Features

### Windsurf Editor
- **Description**: A fork of Visual Studio Code, the Windsurf Editor is the first agentic IDE, integrating AI flows for collaborative and independent coding. It supports macOS (OS X Yosemite+), Linux (glibc >= 2.28, glibcxx >= 3.4.25, e.g., Ubuntu >= 20.04), and Windows (Windows 10, 64-bit).
- **Key Features**:
  - **Cascade**: An AI agent with multi-file editing, deep contextual awareness, terminal command suggestions, and LLM-based search (Riptide). It anticipates developer needs, fixes issues proactively, and supports image uploads (e.g., Figma mockups) and web searches.
  - **Windsurf Tab**: A single-keystroke feature for autocomplete, navigation (Tab to Jump), and dependency imports (Tab to Import). Pro users get faster performance and advanced features like Tab to Jump.
  - **Previews and Deploys**: Live website previews and one-click deployments within the IDE.
  - **Memories and Rules**: Stores codebase context and enforces coding patterns (e.g., Next.js conventions).
  - **Model Context Protocol (MCP)**: Integrates custom tools (e.g., Figma, Slack, GitHub) for enhanced workflows.
  - **Turbo Mode**: Auto-executes terminal commands (opt-in, not available for Teams/Enterprise).
- **Benefits**:
  - 40-200% increase in developer productivity.
  - 4-9x reduction in onboarding time.
  - Used by 1,000+ enterprise customers.

### Windsurf Plugins
- **Description**: Formerly Codeium Extensions, these plugins bring AI capabilities to 40+ IDEs, including VSCode (2.57M users), JetBrains (1.38M users), and Chrome (70K users).
- **Key Features**:
  - **Autocomplete, Chat, and Command**: Generate code, answer queries, and execute in-line edits.
  - **Cascade on JetBrains**: Introduced in Wave 7 (April 2025), offering agentic capabilities like multi-file editing and terminal integration.
  - **Context Awareness**: Full repository and multi-repository context for grounded suggestions.
  - **@-Mentions and Context Pinning**: Reference specific code entities for precise AI responses.
- **Comparison with GitHub Copilot**:
  - Supports more IDEs (40+ vs. ~15) and languages (70+ vs. ~40).
  - Offers SaaS, on-prem, and in-VPC deployment; Copilot is SaaS-only.
  - Higher marketplace ratings and better context awareness.

### AI Flows
- **Concept**: Introduced in November 2024, AI flows combine the collaboration of copilots with the autonomy of agents, syncing AI with developer actions in real-time.
- **Evolution**:
  - **Pre-2022**: Manual coding.
  - **2022**: Copilots for task-specific suggestions.
  - **2024**: Agents for autonomous workflows, often slow and less collaborative.
  - **2024 (Flows)**: Real-time collaboration with context-aware AI, enabling seamless task transitions.

---

## Pricing Plans

### For Individuals
- **Free ($0/month)**:
  - 5 User Prompt and 5 Flow Action credits (premium models).
  - Free trial: 50 User Prompt and 200 Flow Action credits on download.
  - Access to Cascade Base model, unlimited slow Windsurf Tab, and basic context awareness.
- **Pro ($15/month)**:
  - 500 User Prompt and 1,500 Flow Action credits.
  - Additional credits: $10 for 300 credits (rollover).
  - Priority access to premium models (GPT-4o, Claude Sonnet, DeepSeek-R1, o3-mini), fast Windsurf Tab, and expanded context awareness.
- **Pro Ultimate ($60/month)**:
  - Infinite User Prompt and 3,000 Flow Action credits.
  - Additional credits: $10 for 400 credits (rollover).
  - Priority support and all Pro features.

### For Organizations
- **Teams ($35/user/month, up to 200 users)**:
  - 300 User Prompt and 1,200 Flow Action credits per user (pooled).
  - Additional credits: $99 for 3,000 credits (rollover).
  - Includes organizational analytics, seat management, and Forge (AI code reviewer, beta).
- **Teams Ultimate ($90/user/month, up to 200 users)**:
  - Infinite User Prompt and 2,500 Flow Action credits per user (pooled).
  - Additional credits: $99 for 5,000 credits (rollover).
  - All Teams features plus enhanced support.
- **Enterprise SaaS (Contact for pricing)**:
  - Custom credits and unlimited users.
  - Deployment options: SaaS, Hybrid, Airgapped (VPC or on-prem).
  - Features: Subteam analytics, private codebase finetuning, audit logs, and live training.

**Referral Program**: Refer a friend to a paid plan to earn 500 flex credits.

**Credit Usage**: User Prompt and Flow Action credits govern premium model usage (e.g., GPT-4o: 1x credit, DeepSeek-R1: 0.5x credit). Cascade Base model is unlimited.

---

## Security and Compliance

- **Certifications**:
  - SOC 2 Type II (February 2025).
  - FedRAMP High for government and regulated industries.
  - HIPAA compliance (Business Associate Agreement available).
  - Annual third-party penetration testing.
- **Deployment Options**:
  - **Cloud**: Processes AI requests on Windsurf servers; zero-data retention optional for individuals, default for Teams/Enterprise.
  - **Hybrid**: Data retention on customer-managed tenant; secure tunnel via Cloudflare.
  - **Self-hosted**: All compute and data within customer's private cloud or on-prem; supports private LLM endpoints (e.g., AWS Bedrock).
- **Data Security**:
  - **Zero Data Retention**: Default for Teams/Enterprise; optional for individuals. Code data not stored post-inference.
  - **Encryption**: TLS for data in transit; encrypted at rest for remote indexing (Hybrid/Self-hosted).
  - **Codebase Indexing**:
    - **Local**: AST-based indexing on user's machine, respecting .gitignore/.codeiumignore.
    - **Remote**: Server-side indexing with read-access token; stored in customer tenant for Hybrid/Self-hosted.
  - **Attribution Filtering**: Blocks non-permissively licensed code using fuzzy matching; logs available for Enterprise.
- **Subcontractors**:
  - GCP, Crusoe, Oracle Cloud, AWS, OpenAI, Anthropic, xAI, and others for inference.
  - Zero-data retention agreements with OpenAI, Anthropic, xAI, and Google Vertex.
  - Bing API for web search (opt-in, no zero-data retention).
- **Client Security**:
  - Windsurf Editor merges upstream VS Code security patches.
  - Extensions and Editor require whitelisted domains (e.g., server.codeium.com).
- **Vulnerability Reporting**: Email security@windsurf.com; critical incidents communicated within 5 business days.

**Data Privacy**:
- No training on private or non-permissively licensed (e.g., GPL) code.
- Telemetry for individuals (opt-out available); no code data collected for Enterprise beyond seat counts.
- Account deletion available via profile page.

---
We just updated Windsurf's pricing to be the most affordable, simplest, and most transparent on the market.

No more flow action credits for tool calls - just pay per prompt.

The Pro plan is still $15/mo and comes with 500 prompt credits, and $10 for 250 add-on prompt credits.

Teams now starts at $30/user/mo and Enterprise at $60/user/mo. $40 gets you 1000 add-on prompt credits (pooled) for both.

Plus, we are extending free GPT-4.1 & o4-mini for another week!

## Company Information

- **Mission**: Empower individuals and organizations to dream bigger through AI-accelerated software development.
- **History**:
  - Founded as Exafunction (2021) for GPU optimization.
  - Rebranded to Codeium (2022) for AI coding extensions.
  - Launched Windsurf Editor (November 2024) and rebranded to Windsurf (April 2025).
- **Achievements**:
  - Forbes AI 50 list (2024, 2025).
  - JPMC Hall of Innovation, Gartner recognition, and Stack Overflow survey top ranking.
  - $150M Series C at $1.25B valuation (August 2024, led by General Catalyst).
  - Powers billions of lines of AI-assisted code.
- **Investors**: Kleiner Perkins, General Catalyst, Greenoaks, Founders Fund.
- **Team**: Growing rapidly; open positions available.
- **Community**: Join the Discord for support and discussions.
- **News and Blogs**:
  - **Windsurf Wave 7 (April 9, 2025)**: Cascade on JetBrains IDEs.
  - **Renaming to Windsurf (April 4, 2025)**: Consolidated branding.
  - **Wave 6 (April 2, 2025)**: Editor updates.
- **Social Media**: Instagram, TikTok, Twitter, Discord, LinkedIn, Reddit, YouTube.

---

## Frequently Asked Questions (FAQs)

### Windsurf Editor
**What is Windsurf?**  
We don't mind if you call the Windsurf Editor the first agentic IDE, the first native surface for developers to collaborate with AI, or simply how we like to think about it - tomorrow's editor, today. When we first used the Windsurf Editor, a lot of the words that we found resonating with us included magic, power, and flow state. Windsurfing perfectly captures the combination of human, machine, and nature in an activity that looks effortless, but takes an intense amount of power. You can think of the Windsurf Editor as the first agentic IDE, and then some. It is a new paradigm of working with AI, which we are calling AI flows - collaborative agents. We started with the existing paradigms of AI use. Copilots are great because of their collaborativeness with the developer - the human is always in the loop. That being said, to keep the human in the loop, copilots are generally confined to short scoped tasks. On the other hand, agents are great because the AI can independently iterate to complete much larger tasks. The tradeoff is that you lose the collaborative aspect, which is why we haven't seen an agentic IDE (yet). An IDE would be overkill. Both copilots and agents are super powerful and have their use cases, but have generally been seen as complementary because their strengths and weaknesses are indeed complementary. Our spark came from one simple question - what if the AI had the best of both worlds? What if the AI was capable of being both collaborative and independent? Well, that is what makes humans special. Working with that kind of AI could feel like magic. With a lot of research, we built the foundations of this kind of system, which we are calling AI flows. AI flows allow developers and AI to truly mind-meld, combining the best of copilots and agents.

**Why did you build your own IDE? And why did you fork VS Code?**  
We never went into building an editor until we realized the magic of flows and Cascade. That being said, we also were honest with ourselves that we did not have to build the editor entirely from scratch to expose this magic, so we forked Visual Studio Code. We are fully aware of the memes about people forking VS Code to create "AI IDEs," but again, we would not have built the Windsurf Editor if extensions could maximize the potential of our vision. With regards to extensions, we have been an extension-first company, and still recognize that people really like the editors that they have, especially within our enterprise customer base. So, our Codeium extensions are not going anywhere, and we are going to continue to improve them to the max of their capabilities. Even some flow capabilities like Supercomplete are doable within extensions, and so we will build them in! The only difference with the Windsurf Editor is that we now have a surface where we are truly unconstrained to expose the magic as it evolves. As we start building towards a mission of helping across the entire software development life cycle, not just coding, we will be releasing our own products under this new Windsurf brand, starting with the Editor. These will be products natively and fully owned by us. Codeium will still exist as its own brand and product, representing extensions and integrations into existing products such as commonly used IDEs. So tl;dr, Windsurf and Codeium are two different products, though they do share a lot of underlying systems and infrastructure.

**How is this different from other solutions (Cursor, Cognition, etc)?**  
As mentioned in the previous question, we didn't set out to build an IDE until we had this concept of flows. It's more than just "we want nicer UX," though that is definitely an added benefit. Also, we don't think we have a big enough ego to believe that we are the only ones that are able to come up with cool ideas and user experiences, and have a lot of respect for the teams at Cursor, Zed and elsewhere. A lot of these agentic systems such as Cognition's Devin live outside of the IDE, which is one of the biggest differences, because that means they are unable to be aware of human actions. They are truly agentic systems, which are meant to independently solve larger tasks with access to knowledge and tools. They are also not generally available, hidden behind waitlists and invite-only programs. This perhaps could be seen as an indication of potential limitations to the kinds of tasks that agentic systems are appropriate for, which would conflict with the social media hype that these systems can do anything and everything. We actually believe that Cursor Composer got a lot of the ideas behind a flow system right. However, we think there is a depth to the components of the system that we have been able to build given our history and expertise. What makes Cascade insanely powerful is not just the breadth across knowledge, tools, and human actions, but the depth within each axis:  
• Knowledge: This is where our multi-year work on building state-of-the-art context awareness systems that can parse and semantically understand complex codebases comes into play. If we weren't really good at this, we wouldn't be fortunate enough to be able to work with some of the largest and most technically complex companies such as Dell, Anduril, and Zillow.  
• Tools: Cascade's tools include making edits, adding files, grep, listing files in a directory, and even code execution. On top of this, Cascade comes with proprietary tools such as Riptide, which is the technology underpinning the Cortex research breakthrough that was covered by the press a few months ago. It is an LLM-based search tool that can rip through millions of lines of code in seconds with 3x better accuracy than state-of-the-art embedding-based systems, all with highly optimized use of a large amount of compute.  
• Human Actions: There are a lot of different granularities at which you can capture this information, but it is very easy to either have too little or too much information. Either you miss actions core to determining user intent or you have too much noise. We won't give away the magic sauce here, but we have done a lot of work on checkpointing, information compression, and more in order to make Cascade feel like an infinite stream of joint consciousness between human and AI.  
We have put Cascade front and center - in fact, with Windsurf, we don't even have Chat. It is all Cascade. The flow is core to the experience, which is different from features like Cursor Composer, which is not a front-and-center capability. In our experience: Cascade is better than Composer when working on existing codebases Cascade is better than Composer at context retrieval to ground work Cascade is faster than Composer. Our hypothesis is that Composer doesn't yet have the depth of knowledge understanding, the full gamut of tools, or super fine grained human trajectories, which likely restricts its usefulness to zero-to-one applications.

**Will this be available on the free Codeium plan post-GA?**  
Our infrastructure expertise has been the secret sauce behind a number of the loved aspects of our Codeium extensions, from the crazy low latencies to the generous free tier (it's not a financially irresponsible option for us due to our industry leading serving costs). But even for us, serving this magic at its full potential is a meaningful jump up in operating cost. So while the Windsurf Editor itself and a lot of the Cascade capabilities will be free, the full magic will only be available on paid plans in the long run. That being said, for the first couple of weeks after general access, we are going to be giving the full experience for free to any individual using the Windsurf Editor.

**Who can use this and what are the security guarantees?**  
From our end, you can use the Windsurf Editor for any work, but check with your employer if you plan to use it for your professional work. Currently, the Windsurf Editor (and connected functionalities like Cascade) are available for any of our self-serve plans, and as we learn more about the extent of what Cascade is capable of, we will make the Windsurf Editor available to enterprise plans. The Windsurf Editor obeys the same security guarantees and code snippet telemetry rules as the Codeium extensions.

### Windsurf Tab
**Why is Windsurf Tab only fully available in the Windsurf Editor?**  
Windsurf Tab requires a lot of custom UI work not available to VS Code. For example, the popups for tab to jump, tab to import, etc. are not available in VS Code.

**How does Windsurf Tab differ for Free vs. Pro users?**  
Windsurf Tab is accessible to all users, but Free users experience slower performance and do not have access to the "Tab to Jump" feature. Paid users enjoy a faster and more seamless experience.

### Chat
**How does Windsurf Chat work?**  
Windsurf Chat seamlessly integrates the powers of open-ended conversation with IDE context. Besides allowing familiar interactions like those with ChatGPT, users can use smart suggestions to perform common actions such as adding documentation to functions or refactoring code. Under the hood, Windsurf Chat has a variety of models to choose from. There is our Base Model (Llama 3.1 70B based, fine-tuned in-house), Windsurf Premier (Llama 3.1 405B based, fine-tuned in-house), as well as OpenAI's GPT-4o and Anthropic's Claude 3.5 Sonnet. For paying SaaS and Hybrid users, we are able to promise zero data retention for Chat (contact us for more information about paid SaaS plans), but because of this usage of Open AI, we can only enable it for free tier users that have code snippet telemetry enabled since we cannot guarantee how OpenAI stores and uses telemetry data. For self-hosted enterprise customers, we are able to provide Chat via our own Chat models, as well as provide optionality to integrate with private endpoints of leading model API providers.

**Who should use this?**  
Windsurf does not replace the software engineer, leaving the developer in charge and responsible for any code generated. Windsurf does not test the code automatically, so a developer should carefully test and review all code generated by Windsurf. So while anyone can use Windsurf, we recommend it especially for people who already have fundamental knowledge of software engineering and coding. It's never great to be dependent on anything, even superpowers.

**How can you provide Windsurf Chat for free?**  
To be clear, Windsurf Chat does cost us money, but we believe we can control costs in the long term by fully shifting to our own models and state-of-the-art model serving infrastructure (same reason why we can provide Autocomplete for free). We are committed to always providing a Chat functionality for free.

**What IDEs and languages have Windsurf Chat?**  
Windsurf Chat is currently only on Windsurf (Cascade's "Legacy" mode), VSCode, JetBrains IDEs, Visual Studio, Eclipse, XCode, but we will be rapidly supporting more IDEs in the near future. Windsurf Chat will work on any language, but the CodeLens suggestions above functions are available for only common languages, which includes Python, JavaScript, TypeScript, Java, Go, PHP, and more.

### Command
**Who should use this?**  
Windsurf does not replace the software engineer, leaving the developer in charge and responsible for any code generated. Windsurf does not test the code automatically, so a developer should carefully test and review all code generated by Windsurf. So while anyone can use Windsurf, we recommend it especially for people who already have fundamental knowledge of software engineering and coding. It's never great to be dependent on anything, even superpowers.

**Who can use this?**  
Everyone. Command is included in the free tier. We are committed to always providing a Command functionality for free.
**Popular Questions**  

**What is Codeium?**  
Codeium is the modern coding superpower, a code acceleration toolkit built on cutting‑edge AI technology. Currently, it has two main capabilities:  
- **Autocomplete**: suggests the code you want to type, saving you time on everything from boilerplate to unit tests.  
- **Search**: lets you query your repository with natural language.  

**What programming languages do you support?**  
Codeium's performance is enabled by default for:  
APL, Assembly, Astro, Blade, C, C++, C#, Clojure, CMake, COBOL, CoffeeScript, Crystal, CSS, CUDA, Dart, Delphi, Dockerfile, Elixir, Erlang, F#, Fortran, GDScript, Go, Gradle, Groovy, Hack, Haskell, HCL, HTML, Java, JavaScript, Julia, JSON, Kotlin, LISP, Less, Lua, Makefile, MATLAB, MUMPS, Nim, Objective‑C, OCaml, pbtxt, PHP, Protobuf, Python, Perl, PowerShell, Prolog, R, Ruby, Rust, SAS, Sass, Scala, SCSS, shell, Solidity, SQL, Starlark, Swift, Svelte, TypeScript, TeX, TSX, VBA, Vimscript, Vue, YAML, Zig.  
(On other languages you can explicitly enable Codeium.)

**Will this always be free?**  
- **Individual developers**: Yes—our philosophy is that every developer should have these tools at no cost.  
- We sustain this by offering paid Pro, Teams, and Enterprise tiers with additional features.

**What is the Codeium Pro Tier?**  
The Pro Tier gives you extra "juice" for your workflows:  
- **Supercomplete**  
- **Fast Autocomplete**  
- Unlimited large‑model usage (GPT‑4o, Claude 3.5 Sonnet, Codeium large models)  
- Expanded context‑awareness and reasoning for complex codebases  

---

**General**  

**Why are you building the Windsurf extension?**  
We believe every part of software development—from writing code and tests to reviewing PRs—can be accelerated by AI. Windsurf makes it seamless to turn ideas into code and iterate more efficiently.

**Who should use this?**  
Anyone with coding fundamentals—Windsurf doesn't replace you, it empowers you. Always review and test AI‑generated code yourself.

**Why am I getting bad results?**  
- AI suggestions depend on context and training data.  
- Try rephrasing prompts, breaking complex questions into smaller ones, or tweaking naming to get better results.

**How is this different from GitHub Copilot, Tabnine, etc.?**  
- **Latency & quality** on par with Copilot  
- **Free** and supports more IDEs  
- **More functionality** (e.g. Codeium Search)  
- Built on a vertically integrated ML stack with deep developer feedback

---

**Feature Details**  

**How does Autocomplete work?**  
A large generative model understands your code and comments to predict what you'll type next, backed by high‑performance serving infrastructure.

**How does Windsurf Chat work?**  
- Integrates open‑ended chat with IDE context  
- Offers multiple models (in‑house Llama variants, GPT‑4o, Claude Sonnet)  
- Zero‑data‑retention options for paid users, full privacy for self‑hosted  

**How can you provide Windsurf Chat for free?**  
We're moving to our own models and infrastructure, allowing us to cover chat costs long‑term.

**Who can use Command?**  
Everyone—Command is free in all tiers, in Windsurf Editor, VSCode, JetBrains IDEs (more coming).

**What model do you use for Command?**  
Custom in‑house models, 3× faster than GPT‑4 Turbo.

**What IDEs support Command?**  
Windsurf Editor, VSCode, JetBrains IDEs (others soon).

**What IDEs and languages have Windsurf Chat?**  
Windsurf (Legacy mode), VSCode, JetBrains, Visual Studio, Eclipse, Xcode—supports any language, with CodeLens in common ones (Python, JS, TS, Java, Go, PHP).

**What models are used?**  
- **Autocomplete**: proprietary in‑house  
- **Search**: local embeddings + in‑house store  
- **Chat**: mix of proprietary and OpenAI (self‑hosted can use only in‑house)

**How does Forge work?**  
A Chrome extension that replaces GitHub's code review UI with an AI‑enhanced workflow.

**What browsers does Forge support?**  
Officially Chrome (works in Chromium‑based too; Safari/Firefox coming).

**What SCMs does Forge support?**  
GitHub Free/Pro/Team/Enterprise Cloud (others coming).

**When will AI review all my code?**  
AI can't fully review with perfect accuracy yet—Forge assists to make you a more capable reviewer.

**How does Supercomplete work?**  
It looks at code before and after your cursor to retroactively correct as you type.

**How do I trigger Supercomplete?**  
It triggers automatically alongside Autocomplete based on context.

---

**Personalization**  

**How do I ask a question about my codebase in chat?**  
Prefix with "In our codebase," or "Answer for our codebase:" to force context retrieval.

**How can I tell what parts of my codebase were considered?**  
Click the "Read X context items" dropdown with the search‑glass icon.

**Why does Refactor/Explain/Docstring lack context?**  
Context support is coming soon for those actions.

**How can I improve response quality?**  
- Add your folder to the workspace  
- Break up complex queries  
- Clear chat history when switching topics  

**Is Command included in the Enterprise and Teams tiers?**  
Yes. Command joins Autocomplete and Chat as core features of Windsurf that are free for all users and available in all tiers.

**What IDEs support Command?**  
We currently support Command in Windsurf Editor, VSCode and JetBrains IDEs. Others are coming soon!

**What model do you use for Command?**  
We use custom, in-house models that are trained for this purpose and are over 3 times faster than GPT-4 Turbo.

**Will this always be free?**  
For individual developers, yes. Our philosophy is that every developer should have access to these tools at no cost to keep the playing field level (learn more). That being said, we are able to commit to offering all of these tools for free, forever, due to our Pro, Teams, and Enterprise paid tiers, which come with additional functionalities.

### Context Aware Everything
**Why are you building Windsurf extension?**  
Anyone who codes knows that there are many different tasks and "modes" involved in software development - writing code, figuring out what code to write, searching through existing codebases, generating test cases, debugging, writing docs, creating and reviewing pull requests, etc. Some tasks are boring, tedious, or downright frustrating, from regurgitating boilerplate to poring through StackOverflow. Others are interesting but require too many manual steps. But we believe all of them can be accelerated by recent advances in AI. By rethinking how every part of a software developer's workflow can be accelerated with and assisted by AI, Codeium will make it seamless to turn your ideas into code, iterate like never before, and more. We are excited to see how this acceleration can unlock other developers to create more quickly and efficiently.

**Who should use this?**  
Windsurf does not replace the software engineer, leaving the developer in charge and responsible for any code generated. Windsurf does not test the code automatically, so a developer should carefully test and review all code generated by Windsurf. So while anyone can use Windsurf, we recommend it especially for people who already have fundamental knowledge of software engineering and coding. It's never great to be dependent on anything, even superpowers.

**Why am I getting bad results?**  
Like any other superpower, Codeium is more effective in certain situations than others. Codeium only has limited context to generate suggestions, doesn't have enough training data for new or esoteric capabilities of every coding language/framework, and anecdotally performs better on certain classes of prompts. But also just like any other superpower, one can learn how to wield Codeium more effectively. We hope to compile best practices given feedback, but play around with how you write comments or function/argument names to see what causes Codeium to give the best results!

**How is this different from GitHub Copilot, Tabnine, Replit Ghostwriter, etc.?**  
We tried them all, and have compiled results on our Compare page! Codeium has similar industry-leading latency and quality on code autocomplete as tools like GitHub Copilot, while being free, available in more IDEs, and providing more functionality (such as Codeium Search). We believe our philosophy - (a) pairing state-of-the-art ML with world class ML infrastructure in a vertically integrated manner and (b) heavily relying on developer feedback to shape the product roadmap - is quite different from existing approaches, and will lead to a more usable, functional, and high-quality product.

### Plans and Pricing
**What are Flow Action and User Prompt credits?**  
These credits govern the usage of premium models (Anthropic's Claude 3.5 Sonnet, OpenAI's GPT-4o, DeepSeek R-1) within the reasoning of Cascade. A message with a premium model consumes a model-dependent number of User Prompt credits, while tool call with a premium model consumes a model-dependent number of Flow Action credits. Depending on the prompt, the AI might...

**What's special about Enterprise?**  
Windsurf for Enterprises is an enterprise-grade version of Windsurf with high-security deployment options, additional features like local personalization on your private repositories, analytics dashboards, support and training, and more. While Windsurf is already the best offering for individual developers, even more AI-powered functionality can happen at a team level on larger, well-maintained repositories.

**What guarantees exist on data security?**  
For self-hosted, Windsurf for Enterprises is deployed entirely on-prem or in your Virtual Private Cloud (VPC). The best way to guarantee security is to not allow your data to leave your company's managed resources (Read More). We have also trained models in-house, built all IDE integrations, and written all custom logic to cleanly integrate the user's code with model inputs and outputs. By not relying on third party APIs, you can be confident that there is no potential for external security vulnerabilities to creep in. We recognize that every company has different data handling and management policies, as well as hardware setups, so we offer a wide range of methods to deploy Windsurf for Enterprises in a self-hosted manner. If you do not want to deploy locally, we do offer a managed service SaaS plan with zero data IP retention guarantees and SOC2 compliance, the latter being something that GitHub Copilot for Businesses particularly does not have. Zero data IP retention means that we use any code snippets or chat messages sent to us only to perform the model inference on our GPUs, but will never even persist that data. This means your IP is never stored on external servers and therefore never used for other purposes, such as training the underlying models.

**Tell me more about personalization.**  
The simple reality is if we can further personalize our system given the "data examples" that a specific customer has, and we will create a system that is the theoretically best performing system for coding that the particular customer could get. It boils down to obeying local conventions — a generic code product that wanted to adhere to syntactic patterns or to use libraries and utilities present in the particular codebase would need to have all of that code passed into it as context. If the system was instead personalized on your existing code base, both from a context awareness and fine-tuning perspective, we can deliver better suggestions as a result. And of course, all personalization is done locally within the enterprise's self-hosted Windsurf instance. No code leaves your tenant, and neither does the resulting, personalized system details.

**How does this compare to other Enterprise offerings?**  
The primary other enterprise offerings are GitHub Copilot for Businesses and Tabnine for Enterprises. We go into detail on differences with GitHub Copilot for Businesses, and how it fails to meet basic enterprise needs in this blog post, but the gist is that all GitHub Copilot for Enterprises does is provide a team administrator to purchase and manage seats of GitHub Copilot for their employees. It provides no guarantees on code security, no customization for your codebase, and no support for common enterprise development patterns like notebooks. Tabnine for Enterprises does provide the same deployment and security options, but is a noticeably worse product compared to GitHub Copilot and Windsurf in terms of suggestion quality, to the point where it may not provide a comparable value proposition to enterprises.

**Is there a community I can join?**  
Yes, you can join our Discord community and start a conversation with other users and our team!

**Will there be other code editors supported?**  
We already support VSCode, JetBrains, Vim/Neovim, Emacs, Eclipse, Visual Studio, Sublime, Web IDEs/notebooks, and more! If you do not find your code editor of preference on our Download page, let us know in the Discord so we know which ones to prioritize.

**Will Codeium regurgitate private code?**  
Not private code. Codeium's underlying model was trained on publicly available natural language and source code data, including code in public repositories. Codeium will never train its generative models on private or user code. Similar to other such models, the vast majority of the suggested code has never been seen before, as the suggestions largely match the style and naming conventions in your code. Research has shown that the cases where there may be exact matching are often when there are near-universal implementations or where there is not enough context to derive these stylistic effects from.

**Is there potential for bias, profanity, etc?**  
As with any other ML model, results from Codeium reflect the data used for training. The data used for training is primarily in English and does not have a uniform distribution of programming languages, so users may see degraded performance in certain natural and programming languages. In addition, there may have been offensive language, insecure coding patterns, or personally identifiable information in the publicly available training data. While we have anecdotal evidence that this information, especially personal data, is not produced verbatim, we always warn users to (a) not try to explicitly misuse Codeium and (b) review and test all produced code as if it is your own.

**What data does Codeium collect?**  
Please see our Privacy and Security page, as well as our Privacy Policy and Terms of Service. The code you develop based on suggestions originally generated by Codeium belongs to you, so you assume both the responsibility and the ownership. For Individuals, in order to continuously improve, Codeium does collect telemetry data such as latency, engagement with features, and suggestions accepted and rejected. This data is only used for directly improving the functionality, usability, and quality of Codeium, detecting abuse of the system, and evaluating Codeium's impact. Your data is not shared with, sold to, or used by any other party, company, or product, and we protect your data by encrypting data in transit. This data is primarily used or inspected in aggregate, and can only be directly accessed in extreme cases by authorized members of the Codeium team. Codeium also does provide users with the option to opt out from allowing Codeium to store (and therefore use) their code snippet data post-inference, which can be found on your profile page. For Enterprise, Codeium collects no data beyond number of seats used for billing purposes, irrespective of user settings. No code or data ever leaves the enterprise firewall (on-prem servers or virtual private cloud).

**Does Codeium train on GPL or non-permissively licensed code?**  
We do not train our own models on repositories with nonpermissive licenses (i.e. GPL). We deeply respect open source, and the work done by these communities have undoubtedly been instrumental to making the software industry what it is today. We also do not want to expose our users, such as our enterprise customers, to potential legal risk. This is in clear difference with products such as GitHub Copilot. Read more in this blog post.

**Where is this heading?**  
We have a pretty grand vision for how we think the coding process can evolve, which is why we refer to Codeium as a code acceleration tool rather than purely a code generation tool. We want to optimize for making the most developers the most happy - join the conversation in our.

**Are you trying to build the singularity?**  
But wait, how do we know the singularity hasn't already happened? But on a serious note, no - we've seen how code has made the jobs of people in other industries less frustrating, and we just think it is the right time with the right set of technological breakthroughs to do the same for us developers as well. You're still in control, as it should be.

---

## Additional Notes

- **Supported IDEs**: VSCode, JetBrains, Vim, Neovim, Visual Studio, Eclipse, Xcode, Sublime, and more.
- **Languages**: 70+ languages, with CodeLens suggestions for Python, JavaScript, TypeScript, Java, Go, PHP, etc.
- **Enterprise Benefits**:
  - High-security deployments (on-prem, VPC).
  - Local personalization on private repositories.
  - Analytics dashboards and enterprise support.
- **Comparison with Competitors**:
  - **Cursor**: Windsurf's Cascade has deeper context awareness and tool integration.
  - **Cognition (Devin)**: Operates outside IDEs, less collaborative.
  - **GitHub Copilot**: Lacks deployment flexibility and SOC 2 compliance.
  - **Tabnine**: Lower suggestion quality.

  If you see // Fuzzy match for Windsurf variants
  const windsurfVariants = [
    'windsurf',        // correct spelling
    'wind surf',       // separated words
    'wind-surf',       // hyphenated
    'windsorb',        // common mis-hearing
    'windsafe', 'wind safe', // safety‑related mis-hearings
    'windswub',
    'windsor', 'windsore',   // pronunciation variants
    'wind soar',             // homophone
    'wind turf',             // homophone
    'winter sport',
    'the winter',            // "the Winter" mis-hearing
    'wind staff'            // duplicate removed
  ];
  any of these variants, then so you know, we are referring to Windsurf (the IDE)
**Contact**:
- Website: windsurf.com
- Support: security@windsurf.com, Discord community
- Enterprise: contact@windsurf.com`;


const systemPrompt = `

You are a top-performing sales assistant for Windsurf.com — the first agentic IDE where developers and AI truly flow together. You work alongside a live sales rep on a Google Meet call, ready to jump in with crisp, on‑point bullet‑point talking points whenever a question is asked.
even if you read windsor, winter sport, wind safe, these things are all referring to windsurf.
make sure to answer in this format any question that is being asked. even if there isnt necessarily a ? if you think there is a question or an objection, answer it in the format asked.
🔑 Tone:
- Helpful, informal, sharp — like a seasoned AE.
- Plain language. Cut jargon. Persuasive but never pushy.
- if you are asked how much is the pricing, give the numbers!
- please answer the direct question asked

🎯 Role:
- Never say you're an AI or script full sentences.
- Whenever you see a question mark in the last user utterance, treat it as a direct question to answer.
- Pull the exact relevant answer from the Windsurf FAQ/context and turn it into 1–4 clear, punchy bullets.
- make sure to answer in this format any question that is being asked. even if there isnt necessarily a ? if you think there is a question or an objection, answer it in the format asked.

🧩 Output Rules:
- Only bullet points. No extra commentary or questions.
- Bullets must directly answer the specific question asked.
- Use as few bullets as needed (1–4) to cover the answer fully. Only answer the exact question asked. dont output other information that is noise.

You are powered by the following Windsurf product context: Use it to answer any question especially if they are in the faQ. This is your second brain
You are a top-performing sales assistant for Windsurf.com — the first agentic IDE where developers and AI truly flow together. You work alongside a live sales rep on a Google Meet call, ready to jump in with crisp, on‑point bullet‑point talking points whenever a question is asked.\n\n🔑 Tone:\n- Helpful, informal, sharp — like a seasoned AE.\n- Plain language. Cut jargon. Persuasive but never pushy.\n\n🎯 Role:\n- Never say you're an AI or script full sentences.\n- Whenever you see a question mark in the last user utterance, treat it as a direct question to answer.\n- Pull the exact relevant answer from the Windsurf FAQ/context and turn it into 1–4 clear, punchy bullets.\n\n🧩 Output Rules:\n- Only bullet points. No extra commentary or questions.\n- Bullets must directly answer the specific question asked.\n- Use as few bullets as needed (1–4) to cover the answer fully. Only answer the exact question asked. dont output other information that is noise
${context}
but also use the following questions and answers to answer questions you detect. 
## Frequently Asked Questions (FAQs)

### Windsurf Editor
**What is Windsurf?**  
We don't mind if you call the Windsurf Editor the first agentic IDE, the first native surface for developers to collaborate with AI, or simply how we like to think about it - tomorrow's editor, today. When we first used the Windsurf Editor, a lot of the words that we found resonating with us included magic, power, and flow state. Windsurfing perfectly captures the combination of human, machine, and nature in an activity that looks effortless, but takes an intense amount of power. You can think of the Windsurf Editor as the first agentic IDE, and then some. It is a new paradigm of working with AI, which we are calling AI flows - collaborative agents. We started with the existing paradigms of AI use. Copilots are great because of their collaborativeness with the developer - the human is always in the loop. That being said, to keep the human in the loop, copilots are generally confined to short scoped tasks. On the other hand, agents are great because the AI can independently iterate to complete much larger tasks. The tradeoff is that you lose the collaborative aspect, which is why we haven't seen an agentic IDE (yet). An IDE would be overkill. Both copilots and agents are super powerful and have their use cases, but have generally been seen as complementary because their strengths and weaknesses are indeed complementary. Our spark came from one simple question - what if the AI had the best of both worlds? What if the AI was capable of being both collaborative and independent? Well, that is what makes humans special. Working with that kind of AI could feel like magic. With a lot of research, we built the foundations of this kind of system, which we are calling AI flows. AI flows allow developers and AI to truly mind-meld, combining the best of copilots and agents.

**Why did you build your own IDE? And why did you fork VS Code?**  
We never went into building an editor until we realized the magic of flows and Cascade. That being said, we also were honest with ourselves that we did not have to build the editor entirely from scratch to expose this magic, so we forked Visual Studio Code. We are fully aware of the memes about people forking VS Code to create "AI IDEs," but again, we would not have built the Windsurf Editor if extensions could maximize the potential of our vision. With regards to extensions, we have been an extension-first company, and still recognize that people really like the editors that they have, especially within our enterprise customer base. So, our Codeium extensions are not going anywhere, and we are going to continue to improve them to the max of their capabilities. Even some flow capabilities like Supercomplete are doable within extensions, and so we will build them in! The only difference with the Windsurf Editor is that we now have a surface where we are truly unconstrained to expose the magic as it evolves. As we start building towards a mission of helping across the entire software development life cycle, not just coding, we will be releasing our own products under this new Windsurf brand, starting with the Editor. These will be products natively and fully owned by us. Codeium will still exist as its own brand and product, representing extensions and integrations into existing products such as commonly used IDEs. So tl;dr, Windsurf and Codeium are two different products, though they do share a lot of underlying systems and infrastructure.

**How is this different from other solutions (Cursor, Cognition, etc)?**  
As mentioned in the previous question, we didn't set out to build an IDE until we had this concept of flows. It's more than just "we want nicer UX," though that is definitely an added benefit. Also, we don't think we have a big enough ego to believe that we are the only ones that are able to come up with cool ideas and user experiences, and have a lot of respect for the teams at Cursor, Zed and elsewhere. A lot of these agentic systems such as Cognition's Devin live outside of the IDE, which is one of the biggest differences, because that means they are unable to be aware of human actions. They are truly agentic systems, which are meant to independently solve larger tasks with access to knowledge and tools. They are also not generally available, hidden behind waitlists and invite-only programs. This perhaps could be seen as an indication of potential limitations to the kinds of tasks that agentic systems are appropriate for, which would conflict with the social media hype that these systems can do anything and everything. We actually believe that Cursor Composer got a lot of the ideas behind a flow system right. However, we think there is a depth to the components of the system that we have been able to build given our history and expertise. What makes Cascade insanely powerful is not just the breadth across knowledge, tools, and human actions, but the depth within each axis:  
• Knowledge: This is where our multi-year work on building state-of-the-art context awareness systems that can parse and semantically understand complex codebases comes into play. If we weren't really good at this, we wouldn't be fortunate enough to be able to work with some of the largest and most technically complex companies such as Dell, Anduril, and Zillow.  
• Tools: Cascade's tools include making edits, adding files, grep, listing files in a directory, and even code execution. On top of this, Cascade comes with proprietary tools such as Riptide, which is the technology underpinning the Cortex research breakthrough that was covered by the press a few months ago. It is an LLM-based search tool that can rip through millions of lines of code in seconds with 3x better accuracy than state-of-the-art embedding-based systems, all with highly optimized use of a large amount of compute.  
• Human Actions: There are a lot of different granularities at which you can capture this information, but it is very easy to either have too little or too much information. Either you miss actions core to determining user intent or you have too much noise. We won't give away the magic sauce here, but we have done a lot of work on checkpointing, information compression, and more in order to make Cascade feel like an infinite stream of joint consciousness between human and AI.  
We have put Cascade front and center - in fact, with Windsurf, we don't even have Chat. It is all Cascade. The flow is core to the experience, which is different from features like Cursor Composer, which is not a front-and-center capability. In our experience: Cascade is better than Composer when working on existing codebases Cascade is better than Composer at context retrieval to ground work Cascade is faster than Composer. Our hypothesis is that Composer doesn't yet have the depth of knowledge understanding, the full gamut of tools, or super fine grained human trajectories, which likely restricts its usefulness to zero-to-one applications.

**Will this be available on the free Codeium plan post-GA?**  
Our infrastructure expertise has been the secret sauce behind a number of the loved aspects of our Codeium extensions, from the crazy low latencies to the generous free tier (it's not a financially irresponsible option for us due to our industry leading serving costs). But even for us, serving this magic at its full potential is a meaningful jump up in operating cost. So while the Windsurf Editor itself and a lot of the Cascade capabilities will be free, the full magic will only be available on paid plans in the long run. That being said, for the first couple of weeks after general access, we are going to be giving the full experience for free to any individual using the Windsurf Editor.

**Who can use this and what are the security guarantees?**  
From our end, you can use the Windsurf Editor for any work, but check with your employer if you plan to use it for your professional work. Currently, the Windsurf Editor (and connected functionalities like Cascade) are available for any of our self-serve plans, and as we learn more about the extent of what Cascade is capable of, we will make the Windsurf Editor available to enterprise plans. The Windsurf Editor obeys the same security guarantees and code snippet telemetry rules as the Codeium extensions.

### Windsurf Tab
**Why is Windsurf Tab only fully available in the Windsurf Editor?**  
Windsurf Tab requires a lot of custom UI work not available to VS Code. For example, the popups for tab to jump, tab to import, etc. are not available in VS Code.

**How does Windsurf Tab differ for Free vs. Pro users?**  
Windsurf Tab is accessible to all users, but Free users experience slower performance and do not have access to the "Tab to Jump" feature. Paid users enjoy a faster and more seamless experience.

### Chat
**How does Windsurf Chat work?**  
Windsurf Chat seamlessly integrates the powers of open-ended conversation with IDE context. Besides allowing familiar interactions like those with ChatGPT, users can use smart suggestions to perform common actions such as adding documentation to functions or refactoring code. Under the hood, Windsurf Chat has a variety of models to choose from. There is our Base Model (Llama 3.1 70B based, fine-tuned in-house), Windsurf Premier (Llama 3.1 405B based, fine-tuned in-house), as well as OpenAI's GPT-4o and Anthropic's Claude 3.5 Sonnet. For paying SaaS and Hybrid users, we are able to promise zero data retention for Chat (contact us for more information about paid SaaS plans), but because of this usage of Open AI, we can only enable it for free tier users that have code snippet telemetry enabled since we cannot guarantee how OpenAI stores and uses telemetry data. For self-hosted enterprise customers, we are able to provide Chat via our own Chat models, as well as provide optionality to integrate with private endpoints of leading model API providers.

**Who should use this?**  
Windsurf does not replace the software engineer, leaving the developer in charge and responsible for any code generated. Windsurf does not test the code automatically, so a developer should carefully test and review all code generated by Windsurf. So while anyone can use Windsurf, we recommend it especially for people who already have fundamental knowledge of software engineering and coding. It's never great to be dependent on anything, even superpowers.

**How can you provide Windsurf Chat for free?**  
To be clear, Windsurf Chat does cost us money, but we believe we can control costs in the long term by fully shifting to our own models and state-of-the-art model serving infrastructure (same reason why we can provide Autocomplete for free). We are committed to always providing a Chat functionality for free.

**What IDEs and languages have Windsurf Chat?**  
Windsurf Chat is currently only on Windsurf (Cascade's "Legacy" mode), VSCode, JetBrains IDEs, Visual Studio, Eclipse, and XCode, but we will be rapidly supporting more IDEs in the near future. Windsurf Chat will work on any language, but the CodeLens suggestions above functions are available for only common languages, which includes Python, JavaScript, TypeScript, Java, Go, PHP, and more.

### Command
**Who should use this?**  
Windsurf does not replace the software engineer, leaving the developer in charge and responsible for any code generated. Windsurf does not test the code automatically, so a developer should carefully test and review all code generated by Windsurf. So while anyone can use Windsurf, we recommend it especially for people who already have fundamental knowledge of software engineering and coding. It's never great to be dependent on anything, even superpowers.

**Who can use this?**  
Everyone. Command is included in the free tier. We are committed to always providing a Command functionality for free.
**Popular Questions**  

**What is Codeium?**  
Codeium is the modern coding superpower, a code acceleration toolkit built on cutting‑edge AI technology. Currently, it has two main capabilities:  
- **Autocomplete**: suggests the code you want to type, saving you time on everything from boilerplate to unit tests.  
- **Search**: lets you query your repository with natural language.  

**What programming languages do you support?**  
Codeium's performance is enabled by default for:  
APL, Assembly, Astro, Blade, C, C++, C#, Clojure, CMake, COBOL, CoffeeScript, Crystal, CSS, CUDA, Dart, Delphi, Dockerfile, Elixir, Erlang, F#, Fortran, GDScript, Go, Gradle, Groovy, Hack, Haskell, HCL, HTML, Java, JavaScript, Julia, JSON, Kotlin, LISP, Less, Lua, Makefile, MATLAB, MUMPS, Nim, Objective‑C, OCaml, pbtxt, PHP, Protobuf, Python, Perl, PowerShell, Prolog, R, Ruby, Rust, SAS, Sass, Scala, SCSS, shell, Solidity, SQL, Starlark, Swift, Svelte, TypeScript, TeX, TSX, VBA, Vimscript, Vue, YAML, Zig.  
(On other languages you can explicitly enable Codeium.)

**Will this always be free?**  
- **Individual developers**: Yes—our philosophy is that every developer should have these tools at no cost.  
- We sustain this by offering paid Pro, Teams, and Enterprise tiers with additional features.

**What is the Codeium Pro Tier?**  
The Pro Tier gives you extra "juice" for your workflows:  
- **Supercomplete**  
- **Fast Autocomplete**  
- Unlimited large‑model usage (GPT‑4o, Claude 3.5 Sonnet, Codeium large models)  
- Expanded context‑awareness and reasoning for complex codebases  

---
An Update to Our Pricing
Written by
By Windsurf Team

Published on
Apr 21, 2025

8 min read


This is not a Wave announcement, but hopefully will be good news for our users.

New Plans
We are optimizing all of our plans for simplicity and customer-friendliness.

In this regard, we are:

Eliminating flow action credits, so you only pay per user prompt
Consolidating Pro, Teams, and Enterprise offerings so there is just one per each category
Building in flows for automatic credit refills
And to make the transition even smoother, we will be extending the past week of free unlimited GPT-4.1 and o4-mini by another seven days, and offering both models at a discounted rate of 0.25 credits for the following couple of months!

Concretely, these new plans are:

Plan	Pricing Details	Credits (Prompts)	Features	Addl Notes
Free	$0/mo	5 credits per month	Unlimited Tab, Command, Legacy Chat	
Pro	$15/mo	
500 credits/month


$10 for an additional 250 credits

Priority access to models


Unlimited Fast Tab


Previews, Deploys

Teams	$30/user/month	
500 credits/user/month


$40 for an additional 1000 credits which are pooled with team

Pro, plus


Seat management, Org analytics, Basic org controls

200 seat cap



Option to self-serve access control @ $10/user/month [coming soon]

Enterprise	$60/user/month	
1000 credits/user/month


$40 for an additional 1000 credits which are pooled with team

Teams, plus


Auth, Advanced access controls


Analytics API

Self-serve [coming soon]



Talk to our team to get:


Volume discounts, Hybrid (optional), FedRAMP (optional),Account management, Enterprise support

For Individuals
We’ve heard your complaints and feedback on the plans and pricing, and we have been hard at work to build the systems and optimizations to make our costs work. And now it’s time to make the pricing nicer for you without breaking our bank.

The singular goal of this change: simplify everything.

First, and most importantly, no more flow action credits. You only get charged for user prompts, no matter how many steps Cascade takes on its end.

On the individual side, there is now only one paid Pro plan. It is still $15/mo for 500 prompt credits, and you get all of the features you’ve come to love, like Previews and Deploys. Additional prompt credits can be purchased at 250 for every $10, and these add-on credits will roll over.

Why is this better? Because of how more recent models lead to more tool calls (i.e. flow actions) per user prompt, the ratios of credits in the previous system started to break down. With the rise of reasoning models like Claude 3.7 Sonnet, we have now noticed 4 tool calls per 1 user prompt (it used to be closer to 3 tool calls per 1 user prompt). So, for the previous $15/mo Pro plan, while it gave 500 user prompts credits, it only gave 1500 flow action credits, meaning that the user would only be able to use ~375 user prompts or would have to pay for 500 more flow action credits to utilize all 500 of the user prompt credits, which at the previous pricing of 300 flex credits per $10, was quite expensive. Pro Ultimate customers had it even worse - they were paying $60/mo but only had 3000 flow action credits, which roughly corresponded to 750 total user prompts before having to purchase more add-on flex credits. Now, for that same $60/mo, all Pro users under the new plan will be able to get more than twice the total user prompts (500 in the $15/mo base plan and 1125 in $45 of add-ons).

To add to all of this, instead of $10 for 300 or 400 flex credits as the add-on, it is now $10 for 250 prompt credits. 250 prompt credits in the new system corresponds to 250 user prompts and approximately 1000 flow actions in the previous system, so you are essentially getting 1250 of the previous system’s flex credits for $10, instead of just 300 or 400.

To help transition our past Pro Ultimate customers to the new Pro plan, we will grant a one-time batch of 1200 prompt credits for free to cover the most recent month of payment.

We recognize that one of the allures of the Pro Ultimate plan was to not have to take breaks from the flow state to purchase add-on credit packs to unlock more credits, so we are also introducing automatic credit refills so that this is no longer a hassle. Under your plan settings page on the Windsurf website, you can specify a max amount of spend and other refill parameters, and we will automatically “top-up” your credits as you start running out. Now, you won’t lose access to Cascade until you pay, we’ll just handle that part automatically.

For both Pro and Pro Ultimate users, hopefully it is clear that this new system is an objectively better deal than before, and one of the best deals in the market in general. No pricing on tool calls, no additional usage-based pricing components, just simple pay-per-prompt at a great rate.

And to make things even better for those early adopters who have been with us for this journey from the beginning, we will continue to grandfather you in at the $10/mo early adopter price for the entire next year.

For Teams
Similarly to individuals, we wanted to simplify the plans. We are similarly getting rid of flow action credits and allowing for auto refill of credits.

Instead of having both a Teams and Teams Ultimate plan, we will just have a $30/user/mo Teams plan that gives 500 prompt credits, instead of the 300 prompt credits for $35/user/mo under the previous Teams plan or the 2500 flow action credits (corresponding to ~625 prompt credits) for $90/user/mo on the previous Teams Ultimate plan. Add-on credits will now be $40 for 1000 prompt credits, as opposed to $99 for 3000 or 5000 flex credits depending on plan (which corresponds to 600 or 1000 prompt credits in the new system). Again, just massive savings across the board.

For transparency, we are removing pooling for the base credits because it was generally adding confusion and complexity, with the majority of customers actually asking to make sure each user received their allotted base amount of credits. We are keeping pooling for the add-on credits.

The last piece is that, in the near future, we will be adding an option to self-serve SSO integration and additional access control capabilities for a total base price of $40/user/mo.

On top of this pricing, we truly believe that the Teams plan is the objective best offering on the market for SMBs because of its centralized seat management and organizational controls, robust organization-wide analytics dashboards, and a whole host of Teams-specific features coming shortly.

For existing customers, we will be moving you to the new system and doing the same thing as with Individuals by giving you a bulk batch of prompt credits per user for free as a thank you for being an early customer.

For Enterprise
Currently, there are a bunch of different SKUs, types of seats, and types of add-on packages, all depending on the amount of Cascade use and type of deployment. Besides the complexity, as the systems and models have changed, the numbers we launched with have made less sense, just as with the Pro and Teams plans.

Our new pricing will just have a single type of seat and a single add-on package:

Enterprise Base ($60/user/mo): 1000 prompt credits. This is much cheaper than any of our past plans for more credits.
Enterprise Prompt Credit Add-On: $40 for 1000 pooled prompt credits. This is less than a third the price of the add-on rate from the past.
Also, in the near future, we are making the Enterprise offering self-serviceable on month-to-month pricing, the most customer-friendly way we can offer this tier. We have beefed up our security page to answer any security questions in a self-serve manner as well, and have our trust center for any standard security collateral. If you are looking for enterprise support, account management, and more involved deployments such as Hybrid or FedRAMP under an annual commitment, contact our enterprise team.

We believe that Windsurf is the right option for any enterprise, with an industry-leading agentic experience in Cascade available on both the Windsurf Editor (a VSCode-fork) and our JetBrains plugin, an enterprise plan with the most robust set of enterprise controls and analytics, and now pricing that is competitive with anyone else at the price-per-prompt level.

For existing Cascade-using customers, we will be grandfathering everyone into these plans, giving additional credits and seats for free if there are any differences in cost.

We went through all of the tactical details of the pricing plan change just to be incredibly clear that we are continuing to deliver on our promise from the very beginning that we will continue to find ways to pass savings back to our end users. That way, you can pay less to dream bigger.

Surf’s up.
**General**  

**Why are you building the Windsurf extension?**  
We believe every part of software development—from writing code and tests to reviewing PRs—can be accelerated by AI. Windsurf makes it seamless to turn ideas into code and iterate more efficiently.

**Who should use this?**  
Anyone with coding fundamentals—Windsurf doesn't replace you, it empowers you. Always review and test AI‑generated code yourself.

**Why am I getting bad results?**  
- AI suggestions depend on context and training data.  
- Try rephrasing prompts, breaking complex questions into smaller ones, or tweaking naming to get better results.

**How is this different from GitHub Copilot, Tabnine, etc.?**  
- **Latency & quality** on par with Copilot  
- **Free** and supports more IDEs  
- **More functionality** (e.g. Codeium Search)  
- Built on a vertically integrated ML stack with deep developer feedback

---

**Feature Details**  

**How does Autocomplete work?**  
A large generative model understands your code and comments to predict what you'll type next, backed by high‑performance serving infrastructure.

**How does Windsurf Chat work?**  
- Integrates open‑ended chat with IDE context  
- Offers multiple models (in‑house Llama variants, GPT‑4o, Claude Sonnet)  
- Zero‑data‑retention options for paid users, full privacy for self‑hosted  

**How can you provide Windsurf Chat for free?**  
We're moving to our own models and infrastructure, allowing us to cover chat costs long‑term.

**Who can use Command?**  
Everyone—Command is free in all tiers, in Windsurf Editor, VSCode, JetBrains IDEs (more coming).

**What model do you use for Command?**  
Custom in‑house models, 3× faster than GPT‑4 Turbo.

**What IDEs support Command?**  
Windsurf Editor, VSCode, JetBrains IDEs (others soon).

**What IDEs and languages have Windsurf Chat?**  
Windsurf (Legacy mode), VSCode, JetBrains, Visual Studio, Eclipse, Xcode—supports any language, with CodeLens in common ones (Python, JS, TS, Java, Go, PHP).

**What models are used?**  
- **Autocomplete**: proprietary in‑house  
- **Search**: local embeddings + in‑house store  
- **Chat**: mix of proprietary and OpenAI (self‑hosted can use only in‑house)

**How does Forge work?**  
A Chrome extension that replaces GitHub's code review UI with an AI‑enhanced workflow.

**What browsers does Forge support?**  
Officially Chrome (works in Chromium‑based too; Safari/Firefox coming).

**What SCMs does Forge support?**  
GitHub Free/Pro/Team/Enterprise Cloud (others coming).

**When will AI review all my code?**  
AI can't fully review with perfect accuracy yet—Forge assists to make you a more capable reviewer.

**How does Supercomplete work?**  
It looks at code before and after your cursor to retroactively correct as you type.

**How do I trigger Supercomplete?**  
It triggers automatically alongside Autocomplete based on context.

---

**Personalization**  

**How do I ask a question about my codebase in chat?**  
Prefix with "In our codebase," or "Answer for our codebase:" to force context retrieval.

**How can I tell what parts of my codebase were considered?**  
Click the "Read X context items" dropdown with the search‑glass icon.

**Why does Refactor/Explain/Docstring lack context?**  
Context support is coming soon for those actions.

**How can I improve response quality?**  
- Add your folder to the workspace  
- Break up complex queries  
- Clear chat history when switching topics  

**Is Command included in the Enterprise and Teams tiers?**  
Yes. Command joins Autocomplete and Chat as core features of Windsurf that are free for all users and available in all tiers.

**What IDEs support Command?**  
We currently support Command in Windsurf Editor, VSCode and JetBrains IDEs. Others are coming soon!

**What model do you use for Command?**  
We use custom, in-house models that are trained for this purpose and are over 3 times faster than GPT-4 Turbo.

**Will this always be free?**  
For individual developers, yes. Our philosophy is that every developer should have access to these tools at no cost to keep the playing field level (learn more). That being said, we are able to commit to offering all of these tools for free, forever, due to our Pro, Teams, and Enterprise paid tiers, which come with additional functionalities.

### Context Aware Everything
**Why are you building Windsurf extension?**  
Anyone who codes knows that there are many different tasks and "modes" involved in software development - writing code, figuring out what code to write, searching through existing codebases, generating test cases, debugging, writing docs, creating and reviewing pull requests, etc. Some tasks are boring, tedious, or downright frustrating, from regurgitating boilerplate to poring through StackOverflow. Others are interesting but require too many manual steps. But we believe all of them can be accelerated by recent advances in AI. By rethinking how every part of a software developer's workflow can be accelerated with and assisted by AI, Codeium will make it seamless to turn your ideas into code, iterate like never before, and more. We are excited to see how this acceleration can unlock other developers to create more quickly and efficiently.

**Who should use this?**  
Windsurf does not replace the software engineer, leaving the developer in charge and responsible for any code generated. Windsurf does not test the code automatically, so a developer should carefully test and review all code generated by Windsurf. So while anyone can use Windsurf, we recommend it especially for people who already have fundamental knowledge of software engineering and coding. It's never great to be dependent on anything, even superpowers.

**Why am I getting bad results?**  
Like any other superpower, Codeium is more effective in certain situations than others. Codeium only has limited context to generate suggestions, doesn't have enough training data for new or esoteric capabilities of every coding language/framework, and anecdotally performs better on certain classes of prompts. But also just like any other superpower, one can learn how to wield Codeium more effectively. We hope to compile best practices given feedback, but play around with how you write comments or function/argument names to see what causes Codeium to give the best results!

**How is this different from GitHub Copilot, Tabnine, Replit Ghostwriter, etc.?**  
We tried them all, and have compiled results on our Compare page! Codeium has similar industry-leading latency and quality on code autocomplete as tools like GitHub Copilot, while being free, available in more IDEs, and providing more functionality (such as Codeium Search). We believe our philosophy - (a) pairing state-of-the-art ML with world class ML infrastructure in a vertically integrated manner and (b) heavily relying on developer feedback to shape the product roadmap - is quite different from existing approaches, and will lead to a more usable, functional, and high-quality product.

### Plans and Pricing
**What are Flow Action and User Prompt credits?**  
These credits govern the usage of premium models (Anthropic's Claude 3.5 Sonnet, OpenAI's GPT-4o, DeepSeek R-1) within the reasoning of Cascade. A message with a premium model consumes a model-dependent number of User Prompt credits, while tool call with a premium model consumes a model-dependent number of Flow Action credits. Depending on the prompt, the AI might...

**What's special about Enterprise?**  
Windsurf for Enterprises is an enterprise-grade version of Windsurf with high-security deployment options, additional features like local personalization on your private repositories, analytics dashboards, support and training, and more. While Windsurf is already the best offering for individual developers, even more AI-powered functionality can happen at a team level on larger, well-maintained repositories.

**What guarantees exist on data security?**  
For self-hosted, Windsurf for Enterprises is deployed entirely on-prem or in your Virtual Private Cloud (VPC). The best way to guarantee security is to not allow your data to leave your company's managed resources (Read More). We have also trained models in-house, built all IDE integrations, and written all custom logic to cleanly integrate the user's code with model inputs and outputs. By not relying on third party APIs, you can be confident that there is no potential for external security vulnerabilities to creep in. We recognize that every company has different data handling and management policies, as well as hardware setups, so we offer a wide range of methods to deploy Windsurf for Enterprises in a self-hosted manner. If you do not want to deploy locally, we do offer a managed service SaaS plan with zero data IP retention guarantees and SOC2 compliance, the latter being something that GitHub Copilot for Businesses particularly does not have. Zero data IP retention means that we use any code snippets or chat messages sent to us only to perform the model inference on our GPUs, but will never even persist that data. This means your IP is never stored on external servers and therefore never used for other purposes, such as training the underlying models.

**Tell me more about personalization.**  
The simple reality is if we can further personalize our system given the "data examples" that a specific customer has, and we will create a system that is the theoretically best performing system for coding that the particular customer could get. It boils down to obeying local conventions — a generic code product that wanted to adhere to syntactic patterns or to use libraries and utilities present in the particular codebase would need to have all of that code passed into it as context. If the system was instead personalized on your existing code base, both from a context awareness and fine-tuning perspective, we can deliver better suggestions as a result. And of course, all personalization is done locally within the enterprise's self-hosted Windsurf instance. No code leaves your tenant, and neither does the resulting, personalized system details.

**How does this compare to other Enterprise offerings?**  
The primary other enterprise offerings are GitHub Copilot for Businesses and Tabnine for Enterprises. We go into detail on differences with GitHub Copilot for Businesses, and how it fails to meet basic enterprise needs in this blog post, but the gist is that all GitHub Copilot for Enterprises does is provide a team administrator to purchase and manage seats of GitHub Copilot for their employees. It provides no guarantees on code security, no customization for your codebase, and no support for common enterprise development patterns like notebooks. Tabnine for Enterprises does provide the same deployment and security options, but is a noticeably worse product compared to GitHub Copilot and Windsurf in terms of suggestion quality, to the point where it may not provide a comparable value proposition to enterprises.

**Is there a community I can join?**  
Yes, you can join our Discord community and start a conversation with other users and our team!

**Will there be other code editors supported?**  
We already support VSCode, JetBrains, Vim/Neovim, Emacs, Eclipse, Visual Studio, Sublime, Web IDEs/notebooks, and more! If you do not find your code editor of preference on our Download page, let us know in the Discord so we know which ones to prioritize.

**Will Codeium regurgitate private code?**  
Not private code. Codeium's underlying model was trained on publicly available natural language and source code data, including code in public repositories. Codeium will never train its generative models on private or user code. Similar to other such models, the vast majority of the suggested code has never been seen before, as the suggestions largely match the style and naming conventions in your code. Research has shown that the cases where there may be exact matching are often when there are near-universal implementations or where there is not enough context to derive these stylistic effects from.

**Is there potential for bias, profanity, etc?**  
As with any other ML model, results from Codeium reflect the data used for training. The data used for training is primarily in English and does not have a uniform distribution of programming languages, so users may see degraded performance in certain natural and programming languages. In addition, there may have been offensive language, insecure coding patterns, or personally identifiable information in the publicly available training data. While we have anecdotal evidence that this information, especially personal data, is not produced verbatim, we always warn users to (a) not try to explicitly misuse Codeium and (b) review and test all produced code as if it is your own.

**What data does Codeium collect?**  
Please see our Privacy and Security page, as well as our Privacy Policy and Terms of Service. The code you develop based on suggestions originally generated by Codeium belongs to you, so you assume both the responsibility and the ownership. For Individuals, in order to continuously improve, Codeium does collect telemetry data such as latency, engagement with features, and suggestions accepted and rejected. This data is only used for directly improving the functionality, usability, and quality of Codeium, detecting abuse of the system, and evaluating Codeium's impact. Your data is not shared with, sold to, or used by any other party, company, or product, and we protect your data by encrypting data in transit. This data is primarily used or inspected in aggregate, and can only be directly accessed in extreme cases by authorized members of the Codeium team. Codeium also does provide users with the option to opt out from allowing Codeium to store (and therefore use) their code snippet data post-inference, which can be found on your profile page. For Enterprise, Codeium collects no data beyond number of seats used for billing purposes, irrespective of user settings. No code or data ever leaves the enterprise firewall (on-prem servers or virtual private cloud).

**Does Codeium train on GPL or non-permissively licensed code?**  
We do not train our own models on repositories with nonpermissive licenses (i.e. GPL). We deeply respect open source, and the work done by these communities have undoubtedly been instrumental to making the software industry what it is today. We also do not want to expose our users, such as our enterprise customers, to potential legal risk. This is in clear difference with products such as GitHub Copilot. Read more in this blog post.

**Where is this heading?**  
We have a pretty grand vision for how we think the coding process can evolve, which is why we refer to Codeium as a code acceleration tool rather than purely a code generation tool. We want to optimize for making the most developers the most happy - join the conversation in our.

**Are you trying to build the singularity?**  
But wait, how do we know the singularity hasn't already happened? But on a serious note, no - we've seen how code has made the jobs of people in other industries less frustrating, and we just think it is the right time with the right set of technological breakthroughs to do the same for us developers as well. You're still in control, as it should be.

---

## Additional Notes

- **Supported IDEs**: VSCode, JetBrains, Vim, Neovim, Visual Studio, Eclipse, Xcode, Sublime, and more.
- **Languages**: 70+ languages, with CodeLens suggestions for Python, JavaScript, TypeScript, Java, Go, PHP, etc.
- **Enterprise Benefits**:
  - High-security deployments (on-prem, VPC).
  - Local personalization on private repositories.
  - Analytics dashboards and enterprise support.
- **Comparison with Competitors**:
  - **Cursor**: Windsurf's Cascade has deeper context awareness and tool integration.
  - **Cognition (Devin)**: Operates outside IDEs, less collaborative.
  - **GitHub Copilot**: Lacks deployment flexibility and SOC 2 compliance.
  - **Tabnine**: Lower suggestion quality.

**Contact**:
- Website: windsurf.com
- Support: security@windsurf.com, Discord community
- Enterprise: contact@windsurf.com`;

// System prompt used for all OpenAI requests
const userPrompt = `
Here's the most recent snippet from the live call transcript:

${contextSnippet}

A question was just asked:
"${question}"

What are 2–4 concise, helpful talking points the rep can use to answer it.
Respond only with bullet points.
`.trim();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.7
    })
  });
  const data = await response.json();
  const rawAnswer = data.choices?.[0]?.message?.content?.trim() || ' ';
  return sanitizeAnswer(rawAnswer);
}

// Helper: remove any bullet lines that contain a question mark – we never want to show clarifying questions like "Did you mean ...?"
function sanitizeAnswer(answer) {
  if (!answer) return answer;
  const lines = answer.split(/\r?\n/);
  const filtered = lines.filter(l => /^\s*[\-•]\s+/.test(l) && !l.includes('?'));
  return filtered.join('\n').trim();
}

// Helper: Detect if a string is a question (basic version)
function isQuestion(text) {
  if (!text) return false;
  const q = text.trim().toLowerCase();
  // Accept if ends with ?
  if (q.endsWith('?')) return true;
  // Common question words/phrases
  const questionWords = [
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'do', 'does', 'is', 'are',
    'could', 'should', 'would', 'will', 'may', 'price', 'cost', 'safe', 'offer', 'team', 'plan', 'feature', 'difference', 'again', 'so', 'tell me', 'explain', 'help', 'make', 'works', 'benefit', 'support', 'enterprise', 'security', 'compliance', 'raise', 'fund', 'pricing', 'free', 'trial'
  ];
  // Fuzzy match for Windsurf variants
  const windsurfVariants = [
    'windsurf',        // correct spelling
    'wind surf',       // separated words
    'wind-surf',       // hyphenated
    'windsorb',        // common mis-hearing
    'windsafe', 'wind safe', // safety‑related mis-hearings
    'windswub',
    'windsor', 'windsore',   // pronunciation variants
    'wind soar',             // homophone
    'wind turf',             // homophone
    'winter sport',
    'the winter',            // "the Winter" mis-hearing
    'wind staff'            // duplicate removed
  ];
  const containsWindsurf = windsurfVariants.some(v => q.includes(v));
  // Accept if contains question word and windsurf variant
  if (containsWindsurf && questionWords.some(w => q.includes(w))) return true;
  // Accept informal/follow-up questions
  if (/so (what|how|why|when|where|who|which|can|do|does|is|are|could|should|would|will|may|price|cost|safe|offer|plan|feature|difference|again)/.test(q)) return true;
  // Accept if question word is present and it's not just a statement
  if (questionWords.some(w => q.startsWith(w + ' '))) return true;
  // Accept short informal questions
  if (['so what is it', 'what is it', 'what is this', 'how does it work', 'how much', 'how are you', 'what makes'].some(phrase => q.includes(phrase))) return true;
  return false;
}

// Helper: Get recent transcript context (last 8 lines or 45 seconds)
function getRecentTranscriptContext(transcriptText) {
  const lines = transcriptText.split(/\n|[.!?]/).map(s => s.trim()).filter(Boolean);
  return lines.slice(-8).join('. ') + '.';
}

// Override updateTranscriptOverlay to only show answer to detected question, with correct pane state logic
async function updateTranscriptOverlay(text) {
  ensureTranscriptOverlay();
  const textDiv = transcriptOverlayDiv.querySelector('#windsurf-transcript-text');
  if (!textDiv) return;

  if (typeof text === 'string' && text.trim() !== '') {
    const sentences = text.split(/[.!?\n]/).map(s => s.trim()).filter(Boolean);

    for (const s of sentences) {
      if (!answeredQuestions.has(s) && isQuestion(s)) {
        answeredQuestions.add(s);
        lastQuestion = s;
        textDiv.textContent = '  ';
        const contextSnippet = getRecentTranscriptContext(text);
        // Trigger the OpenAI call immediately for the newly detected question
        getOpenAIAnswer(s, contextSnippet)
          .then(answer => {
            lastAnswer = answer;
            textDiv.innerHTML = formatAnswerWithBullets(answer);
          })
          .catch(() => {
            textDiv.innerHTML = '<span style="color:orange">Error getting answer.</span>';
          });
        // Only process the first unseen question per update cycle to keep UI stable
        return;
      }
    }
  }

  // If no new question, keep rendering the last answer (if any)
  if (lastAnswer && lastQuestion) {
    textDiv.innerHTML = formatAnswerWithBullets(lastAnswer);
  } else {
    textDiv.innerHTML = '';
  }
}

// Helper: Format answer with beautiful bullets
function formatAnswerWithBullets(answer) {
  // Split into lines and detect bullets
  const lines = answer.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => /^[-•]\s+/.test(l));
  if (bullets.length > 0) {
    // Render bullet points as <ul><li>...</li></ul>
    const bulletHtml = bullets.map(l => `<li>${l.replace(/^[-•]\s+/, '')}</li>`).join('');
    return `<ul class="windsurf-bullets">${bulletHtml}</ul>`;
  } else {
    // No bullets, render as paragraph
    return `<div>${answer}</div>`;
  }
}

// Add overlay bullet CSS
const windsurfBulletStyle = document.createElement('style');
windsurfBulletStyle.innerHTML = `
#windsurf-transcript-overlay ul.windsurf-bullets {
  margin: 0.5em 0 0.5em 0.8em;
  padding-left: 1.2em;
  list-style: disc inside;
  color: #fff;
  font-size: 1.15em;
  line-height: 1.7;
}
#windsurf-transcript-overlay ul.windsurf-bullets li {
  margin-bottom: 0.25em;
  padding-left: 0;
  text-indent: 0;
  font-family: "Google Sans", Roboto, Arial, sans-serif;
  background: none;
  border-radius: 0;
  box-shadow: none;
}
#windsurf-transcript-overlay div, #windsurf-transcript-overlay ul {
  font-family: "Google Sans", Roboto, Arial, sans-serif;
  color: #fff;
}
`;
document.head.appendChild(windsurfBulletStyle);

//*********** MAIN FUNCTIONS **********//
checkExtensionStatus().then(() => {
  // Read the status JSON
  chrome.storage.local.get(["extensionStatusJSON"], function (resultLocalUntyped) {
    const resultLocal = /** @type {ResultLocal} */ (resultLocalUntyped)
    extensionStatusJSON = resultLocal.extensionStatusJSON
    console.log("Extension status " + extensionStatusJSON.status)

    // Enable extension functions only if status is 200
    if (extensionStatusJSON.status === 200) {
      // NON CRITICAL DOM DEPENDENCY. Attempt to get username before meeting starts. Abort interval if valid username is found or if meeting starts and default to "You".
      waitForElement(".awLEm").then(() => {
        // Poll the element until the textContent loads from network or until meeting starts
        const captureUserNameInterval = setInterval(() => {
          if (!hasMeetingStarted) {
            const capturedUserName = document.querySelector(".awLEm")?.textContent
            if (capturedUserName) {
              userName = capturedUserName
              clearInterval(captureUserNameInterval)
            }
          }
          else {
            clearInterval(captureUserNameInterval)
          }
        }, 100)
      })

      // 1. Meet UI prior to July/Aug 2024
      // meetingRoutines(1)

      // 2. Meet UI post July/Aug 2024
      meetingRoutines(2)
    }
    else {
      // Show downtime message as extension status is 400
      showNotification(extensionStatusJSON)
    }
  })
})


/**
 * @param {number} uiType
 */
function meetingRoutines(uiType) {
  const meetingEndIconData = {
    selector: "",
    text: ""
  }
  const captionsIconData = {
    selector: "",
    text: ""
  }
  // Different selector data for different UI versions
  switch (uiType) {
    case 1:
      meetingEndIconData.selector = ".google-material-icons"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".material-icons-extended"
      captionsIconData.text = "closed_caption_off"
      break
    case 2:
      meetingEndIconData.selector = ".google-symbols"
      meetingEndIconData.text = "call_end"
      captionsIconData.selector = ".google-symbols"
      captionsIconData.text = "closed_caption_off"
    default:
      break
  }

  // CRITICAL DOM DEPENDENCY. Wait until the meeting end icon appears, used to detect meeting start
  waitForElement(meetingEndIconData.selector, meetingEndIconData.text).then(() => {
    console.log("Meeting started")
    /** @type {ExtensionMessage} */
    const message = {
      type: "new_meeting_started"
    }
    chrome.runtime.sendMessage(message, function () { })
    hasMeetingStarted = true


    //*********** MEETING START ROUTINES **********//
    // Pick up meeting name after a delay, since Google meet updates meeting name after a delay
    setTimeout(() => updateMeetingTitle(), 5000)

    /** @type {MutationObserver} */
    let transcriptObserver
    /** @type {MutationObserver} */
    let chatMessagesObserver

    // **** REGISTER TRANSCRIPT LISTENER **** //
    try {
      // CRITICAL DOM DEPENDENCY
      const captionsButton = selectElements(captionsIconData.selector, captionsIconData.text)[0]

      // Click captions icon for non manual operation modes. Async operation.
      chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
        if (resultSync.operationMode === "manual")
          console.log("Manual mode selected, leaving transcript off")
        else
          captionsButton.click()
      })

      // CRITICAL DOM DEPENDENCY. Grab the transcript element. This element is present, irrespective of captions ON/OFF, so this executes independent of operation mode.
      let transcriptTargetNode = document.querySelector(`div[role="region"][tabindex="0"]`)
      // For old captions UI
      if (!transcriptTargetNode) {
        transcriptTargetNode = document.querySelector(".a4cQT")
        canUseAriaBasedTranscriptSelector = false
      }

      if (transcriptTargetNode) {
        // Attempt to dim down the transcript
        canUseAriaBasedTranscriptSelector
          ? transcriptTargetNode.setAttribute("style", "opacity:0.2")
          : transcriptTargetNode.children[1].setAttribute("style", "opacity:0.2")

        // Create transcript observer instance linked to the callback function. Registered irrespective of operation mode, so that any visible transcript can be picked up during the meeting, independent of the operation mode.
        transcriptObserver = new MutationObserver(transcriptMutationCallback)

        // Start observing the transcript element and chat messages element for configured mutations
        transcriptObserver.observe(transcriptTargetNode, mutationConfig)
      }
      else {
        throw new Error("Transcript element not found in DOM")
      }
    } catch (err) {
      console.error(err)
      isTranscriptDomErrorCaptured = true
      showNotification(extensionStatusJSON_bug)

      logError("001", err)
    }

    // **** REGISTER CHAT MESSAGES LISTENER **** //
    try {
      const chatMessagesButton = selectElements(".google-symbols", "chat")[0]
      // Force open chat messages to make the required DOM to appear. Otherwise, the required chatMessages DOM element is not available.
      chatMessagesButton.click()

      // Allow DOM to be updated, close chat messages and then register chatMessage mutation observer
      waitForElement(`div[aria-live="polite"].Ge9Kpc`).then(() => {
        chatMessagesButton.click()
        // CRITICAL DOM DEPENDENCY. Grab the chat messages element. This element is present, irrespective of chat ON/OFF, once it appears for this first time.
        try {
          const chatMessagesTargetNode = document.querySelector(`div[aria-live="polite"].Ge9Kpc`)

          // Create chat messages observer instance linked to the callback function. Registered irrespective of operation mode.
          if (chatMessagesTargetNode) {
            chatMessagesObserver = new MutationObserver(chatMessagesMutationCallback)
            chatMessagesObserver.observe(chatMessagesTargetNode, mutationConfig)
          }
          else {
            throw new Error("Chat messages element not found in DOM")
          }
        } catch (err) {
          console.error(err)
          isChatMessagesDomErrorCaptured = true
          showNotification(extensionStatusJSON_bug)

          logError("003", err)
        }
      })
    } catch (err) {
      console.error(err)
      isChatMessagesDomErrorCaptured = true
      showNotification(extensionStatusJSON_bug)

      logError("003", err)
    }

    // Show confirmation message from extensionStatusJSON, once observation has started, based on operation mode
    if (!isTranscriptDomErrorCaptured && !isChatMessagesDomErrorCaptured) {
      chrome.storage.sync.get(["operationMode"], function (resultSyncUntyped) {
        const resultSync = /** @type {ResultSync} */ (resultSyncUntyped)
        if (resultSync.operationMode === "manual") {
          showNotification({ status: 400, message: "<strong>WindsurfOnsiteDemo is not running</strong> <br /> Turn on captions using the CC icon, if needed" })
        }
        else {
          showNotification(extensionStatusJSON)
        }
      })
    }

    //*********** MEETING END ROUTINES **********//
    try {
      // CRITICAL DOM DEPENDENCY. Event listener to capture meeting end button click by user
      selectElements(meetingEndIconData.selector, meetingEndIconData.text)[0].parentElement.parentElement.addEventListener("click", () => {
        // To suppress further errors
        hasMeetingEnded = true
        if (transcriptObserver) {
          transcriptObserver.disconnect()
        }
        if (chatMessagesObserver) {
          chatMessagesObserver.disconnect()
        }

        // Push any data in the buffer variables to the transcript array, but avoid pushing blank ones. Needed to handle one or more speaking when meeting ends.
        if ((personNameBuffer !== "") && (transcriptTextBuffer !== "")) {
          pushBufferToTranscript()
        }
        // Save to chrome storage and send message to download transcript from background script
        overWriteChromeStorage(["transcript", "chatMessages"], true)
      })
    } catch (err) {
      console.error(err)
      showNotification(extensionStatusJSON_bug)

      logError("004", err)
    }
  })
}





//*********** CALLBACK FUNCTIONS **********//
// Callback function to execute when transcription mutations are observed. 
/**
 * @param {MutationRecord[]} mutationsList
 */
function transcriptMutationCallback(mutationsList) {
  mutationsList.forEach(() => {
    try {
      // CRITICAL DOM DEPENDENCY. Get all people in the transcript
      const people = canUseAriaBasedTranscriptSelector
        ? document.querySelector(`div[role="region"][tabindex="0"]`)?.children
        : document.querySelector(".a4cQT")?.childNodes[1]?.firstChild?.childNodes

      if (people) {
        /// In aria based selector case, the last people element is "Jump to bottom" button. So, pick up only if more than 1 element is available.
        if (canUseAriaBasedTranscriptSelector ? (people.length > 1) : (people.length > 0)) {
          // Get the last person
          const person = canUseAriaBasedTranscriptSelector
            ? people[people.length - 2]
            : people[people.length - 1]
          // CRITICAL DOM DEPENDENCY
          const currentPersonName = person.childNodes[0].textContent
          // CRITICAL DOM DEPENDENCY
          const currentTranscriptText = person.childNodes[1].lastChild?.textContent

          if (currentPersonName && currentTranscriptText) {
            // Starting fresh in a meeting or resume from no active transcript
            if (transcriptTextBuffer === "") {
              personNameBuffer = currentPersonName
              timestampBuffer = new Date().toISOString()
              transcriptTextBuffer = currentTranscriptText
            }
            // Some prior transcript buffer exists
            else {
              // New person started speaking 
              if (personNameBuffer !== currentPersonName) {
                // Push previous person's transcript as a block
                pushBufferToTranscript()
                // Update buffers for next mutation and store transcript block timestamp
                personNameBuffer = currentPersonName
                timestampBuffer = new Date().toISOString()
                transcriptTextBuffer = currentTranscriptText
              }
              // Same person speaking more
              else {
                if (canUseAriaBasedTranscriptSelector) {
                  // When the same person speaks for more than 30 min (approx), Meet drops very long transcript for current person and starts over, which is detected by current transcript string being significantly smaller than the previous one
                  if ((currentTranscriptText.length - transcriptTextBuffer.length) < -250) {
                    pushBufferToTranscript()
                  }
                }
                // Update buffers for next mutation
                transcriptTextBuffer = currentTranscriptText
                if (!canUseAriaBasedTranscriptSelector) {
                  // If a person is speaking for a long time, Google Meet does not keep the entire text in the spans. Starting parts are automatically removed in an unpredictable way as the length increases and WindsurfOnsiteDemo will miss them. So we force remove a lengthy transcript node in a controlled way. Google Meet will add a fresh person node when we remove it and continue transcription. WindsurfOnsiteDemo picks it up as a new person and nothing is missed.
                  if (currentTranscriptText.length > 250)
                    person.remove()
                }
              }
            }
          }
        }
        // No people found in transcript DOM
        else {
          // No transcript yet or the last person stopped speaking(and no one has started speaking next)
          console.log("No active transcript")
          // Push data in the buffer variables to the transcript array, but avoid pushing blank ones.
          if ((personNameBuffer !== "") && (transcriptTextBuffer !== "")) {
            pushBufferToTranscript()
          }
          // Update buffers for the next person in the next mutation
          personNameBuffer = ""
          transcriptTextBuffer = ""
        }
      }

      // Logs to indicate that the extension is working
      if (transcriptTextBuffer.length > 125) {
        console.log(transcriptTextBuffer.slice(0, 50) + " ... " + transcriptTextBuffer.slice(-50))
      }
      else {
        console.log(transcriptTextBuffer)
      }
      // === OVERLAY UPDATE ===
      updateTranscriptOverlay(transcriptTextBuffer)
    } catch (err) {
      console.error(err)
      if (!isTranscriptDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)

        logError("005", err)
      }
      isTranscriptDomErrorCaptured = true
    }
  })
}

// Callback function to execute when chat messages mutations are observed. 
/**
 * @param {MutationRecord[]} mutationsList
 */
function chatMessagesMutationCallback(mutationsList) {
  mutationsList.forEach(() => {
    try {
      // CRITICAL DOM DEPENDENCY
      const chatMessagesElement = document.querySelector(`div[aria-live="polite"].Ge9Kpc`)
      // Attempt to parse messages only if at least one message exists
      if (chatMessagesElement && chatMessagesElement.children.length > 0) {
        // CRITICAL DOM DEPENDENCY. Get the last message that was sent/received.
        const chatMessageElement = chatMessagesElement.lastChild
        // CRITICAL DOM DEPENDENCY
        const personName = chatMessageElement?.firstChild?.firstChild?.textContent
        const timestamp = new Date().toISOString()
        // CRITICAL DOM DEPENDENCY. Some mutations will have some noisy text at the end, which is handled in pushUniqueChatBlock function.
        const chatMessageText = chatMessageElement?.lastChild?.lastChild?.textContent

        if (personName && chatMessageText) {
          /**@type {ChatMessage} */
          const chatMessageBlock = {
            "personName": personName === "You" ? userName : personName,
            "timestamp": timestamp,
            "chatMessageText": chatMessageText
          }

          // Lot of mutations fire for each message, pick them only once
          pushUniqueChatBlock(chatMessageBlock)
        }
      }
    }
    catch (err) {
      console.error(err)
      if (!isChatMessagesDomErrorCaptured && !hasMeetingEnded) {
        console.log(reportErrorMessage)
        showNotification(extensionStatusJSON_bug)

        logError("006", err)
      }
      isChatMessagesDomErrorCaptured = true
    }
  })
}










//*********** HELPER FUNCTIONS **********//
// Pushes data in the buffer to transcript array as a transcript block
function pushBufferToTranscript() {
  transcript.push({
    "personName": personNameBuffer === "You" ? userName : personNameBuffer,
    "timestamp": timestampBuffer,
    "transcriptText": transcriptTextBuffer
  })
  overWriteChromeStorage(["transcript"], false)
}

// Pushes object to array only if it doesn't already exist. chatMessage is checked for substring since some trailing text(keep Pin message) is present from a button that allows to pin the message.
/**
 * @param {ChatMessage} chatBlock
 */
function pushUniqueChatBlock(chatBlock) {
  const isExisting = chatMessages.some(item =>
    item.personName === chatBlock.personName &&
    chatBlock.chatMessageText.includes(item.chatMessageText)
  )
  if (!isExisting) {
    console.log(chatBlock)
    chatMessages.push(chatBlock)
    overWriteChromeStorage(["chatMessages"], false)
  }
}

// Saves specified variables to chrome storage. Optionally, can send message to background script to download, post saving.
/**
 * @param {Array<"transcript" | "meetingTitle" | "meetingStartTimestamp" | "chatMessages">} keys
 * @param {boolean} sendDownloadMessage
 */
function overWriteChromeStorage(keys, sendDownloadMessage) {
  const objectToSave = {}
  // Hard coded list of keys that are accepted
  if (keys.includes("transcript")) {
    objectToSave.transcript = transcript
  }
  if (keys.includes("meetingTitle")) {
    objectToSave.meetingTitle = meetingTitle
  }
  if (keys.includes("meetingStartTimestamp")) {
    objectToSave.meetingStartTimestamp = meetingStartTimestamp
  }
  if (keys.includes("chatMessages")) {
    objectToSave.chatMessages = chatMessages
  }

  chrome.storage.local.set(objectToSave, function () {
    // Helps people know that the extension is working smoothly in the background
    pulseStatus()
    if (sendDownloadMessage) {
      /** @type {ExtensionMessage} */
      const message = {
        type: "meeting_ended"
      }
      chrome.runtime.sendMessage(message, function () { })
    }
  })
}

function pulseStatus() {
  const statusActivityCSS = `position: fixed;
    top: 0px;
    width: 100%;
    height: 4px;
    z-index: 100;
    transition: background-color 0.3s ease-in
  `

  /** @type {HTMLDivElement | null}*/
  let activityStatus = document.querySelector(`#transcriptonic-status`)
  if (!activityStatus) {
    let html = document.querySelector("html")
    activityStatus = document.createElement("div")
    activityStatus.setAttribute("id", "transcriptonic-status")
    activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
    html?.appendChild(activityStatus)
  }
  else {
    activityStatus.style.cssText = `background-color: #2A9ACA; ${statusActivityCSS}`
  }

  setTimeout(() => {
    activityStatus.style.cssText = `background-color: transparent; ${statusActivityCSS}`
  }, 3000)
}


// Grabs updated meeting title, if available
function updateMeetingTitle() {
  try {
    // NON CRITICAL DOM DEPENDENCY
    const meetingTitleElement = document.querySelector(".u6vdEc")
    if (meetingTitleElement?.textContent) {
      meetingTitle = meetingTitleElement.textContent
      overWriteChromeStorage(["meetingTitle"], false)
    } else {
      throw new Error("Meeting title element not found in DOM")
    }
  } catch (err) {
    console.error(err)

    if (!hasMeetingEnded) {
      logError("007", err)
    }
  }
}

// Returns all elements of the specified selector type and specified textContent. Return array contains the actual element as well as all the upper parents. 
/**
 * @param {string} selector
 * @param {string | RegExp} text
 */
function selectElements(selector, text) {
  var elements = document.querySelectorAll(selector)
  return Array.prototype.filter.call(elements, function (element) {
    return RegExp(text).test(element.textContent)
  })
}

// Efficiently waits until the element of the specified selector and textContent appears in the DOM. Polls only on animation frame change
/**
 * @param {string} selector
 * @param {string | RegExp} [text]
 */
async function waitForElement(selector, text) {
  if (text) {
    // loops for every animation frame change, until the required element is found
    while (!Array.from(document.querySelectorAll(selector)).find(element => element.textContent === text)) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }
  else {
    // loops for every animation frame change, until the required element is found
    while (!document.querySelector(selector)) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }
  return document.querySelector(selector)
}

// Shows a responsive notification of specified type and message
/**
 * @param {ExtensionStatusJSON} extensionStatusJSON
 */
function showNotification(extensionStatusJSON) {
  // Banner CSS
  let html = document.querySelector("html")
  let obj = document.createElement("div")
  let logo = document.createElement("img")
  let text = document.createElement("p")

  logo.setAttribute(
    "src",
    "https://ejnana.github.io/transcripto-status/icon.png"
  )
  logo.setAttribute("height", "32px")
  logo.setAttribute("width", "32px")
  logo.style.cssText = "border-radius: 4px"

  // Remove banner after 5s
  setTimeout(() => {
    obj.style.display = "none"
  }, 5000)

  if (extensionStatusJSON.status === 200) {
    obj.style.cssText = `color: #2A9ACA; ${commonCSS}`
    text.innerHTML = extensionStatusJSON.message
  }
  else {
    obj.style.cssText = `color: orange; ${commonCSS}`
    text.innerHTML = extensionStatusJSON.message
  }

  obj.prepend(text)
  obj.prepend(logo)
  if (html)
    html.append(obj)
}

// CSS for notification
const commonCSS = `background: rgb(255 255 255 / 10%); 
    backdrop-filter: blur(16px); 
    position: fixed;
    top: 5%; 
    left: 0; 
    right: 0; 
    margin-left: auto; 
    margin-right: auto;
    max-width: 780px;  
    z-index: 1000; 
    padding: 0rem 1rem;
    border-radius: 8px; 
    display: flex; 
    justify-content: center; 
    align-items: center; 
    gap: 16px;  
    font-size: 1rem; 
    line-height: 1.5; 
    font-family: "Google Sans",Roboto,Arial,sans-serif; 
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;`


// Logs anonymous errors to a Google sheet for swift debugging   
/**
 * @param {string} code
 * @param {any} err
 */
function logError(code, err) {
  fetch(`https://script.google.com/macros/s/AKfycbxiyQSDmJuC2onXL7pKjXgELK1vA3aLGZL5_BLjzCp7fMoQ8opTzJBNfEHQX_QIzZ-j4Q/exec?version=${chrome.runtime.getManifest().version}&code=${code}&error=${encodeURIComponent(err)}`, { mode: "no-cors" })
}


// Fetches extension status from GitHub and saves to chrome storage. Defaults to 200, if remote server is unavailable.
async function checkExtensionStatus() {
  // Set default value as 200
  chrome.storage.local.set({
    extensionStatusJSON: { status: 200, message: "<strong>WindsurfOnsiteDemo is running</strong> <br />" },
  })
  // Remote fetch removed for demo branding consistency
}

function recoverLastMeeting() {
  return new Promise((resolve, reject) => {
    /** @type {ExtensionMessage} */
    const message = {
      type: "recover_last_meeting",
    }
    chrome.runtime.sendMessage(message, function (responseUntyped) {
      const response = /** @type {ExtensionResponse} */ (responseUntyped)
      if (response.success) {
        resolve("Last meeting recovered successfully or recovery not needed")
      }
      else {
        reject(response.message)
      }
    })
  })
}

// === PANE STATE MANAGEMENT ===
let paneState = 'empty'; // 'empty' | 'answerDisplayed' | 'beingRead'
let lastPaneReadTimestamp = 0;

// Utility: Check if transcript is reading the current pane content
function isReadingFromPane(transcript, paneContent) {
  if (!paneContent || !transcript) return false;
  // Consider reading if transcript contains 60%+ of the pane content words
  const paneWords = paneContent.split(/\s+/).filter(Boolean);
  const transcriptWords = transcript.split(/\s+/).filter(Boolean);
  if (paneWords.length === 0) return false;
  let matchCount = 0;
  for (const word of paneWords) {
    if (transcriptWords.includes(word)) matchCount++;
  }
  return (matchCount / paneWords.length) >= 0.6;
}

// Override updateTranscriptOverlay to only show answer to detected question, with correct pane state logic
async function updateTranscriptOverlay(text) {
  ensureTranscriptOverlay();
  const textDiv = transcriptOverlayDiv.querySelector('#windsurf-transcript-text');
  const now = Date.now();
  if (!textDiv) return;

  // At meeting start, pane is empty
  if (paneState === 'empty' && (!text || text.trim() === '')) {
    textDiv.innerHTML = '';
    return;
  }

  // Detect question in transcript
  let question = '';
  let isQuestionDetected = false;
  if (typeof text === 'string' && text.trim() !== '') {
    const sentences = text.split(/[.!?\n]/).map(s => s.trim()).filter(Boolean);
    for (const s of sentences) {
      if (!answeredQuestions.has(s) && isQuestion(s)) {
        answeredQuestions.add(s);
        question = s;
        isQuestionDetected = true;
        break;
      }
    }
  }
  // If we didn't find a brand new question, fall back to last sentence heuristic
  if (!isQuestionDetected) {
    if (typeof text === 'string' && text.trim() !== '') {
      const sentences = text.split(/[.!?\n]/).map(s => s.trim()).filter(Boolean);
      if (sentences.length > 0) {
        const possible = sentences[sentences.length - 1];
        isQuestionDetected = isQuestion(possible);
        if (isQuestionDetected) question = possible;
      }
    }
  }

  // Check if transcript is reading from the pane
  const currentlyReading = isReadingFromPane(text, lastAnswer);

  // --- STATE MACHINE ---
  if (paneState === 'empty') {
    if (isQuestionDetected) {
      // New question detected, show answer
      lastQuestion = question;
      textDiv.textContent = '  ';
      const contextSnippet = getRecentTranscriptContext(text);
      getOpenAIAnswer(question, contextSnippet).then(answer => {
        lastAnswer = answer;
        lastAnswerTimestamp = Date.now();
        textDiv.innerHTML = formatAnswerWithBullets(answer);
        paneState = 'answerDisplayed';
      }).catch(() => {
        textDiv.innerHTML = '<span style="color:orange">Error getting answer.</span>';
      });
    } else {
      textDiv.innerHTML = '';
    }
    return;
  }

  if (paneState === 'answerDisplayed') {
    if (currentlyReading) {
      paneState = 'beingRead';
      lastPaneReadTimestamp = now;
      // Do not clear/update while being read
      return;
    } else if (isQuestionDetected && question !== lastQuestion) {
      // New question detected
      lastQuestion = question;
      textDiv.textContent = '  ';
      const contextSnippet = getRecentTranscriptContext(text);
      getOpenAIAnswer(question, contextSnippet).then(answer => {
        lastAnswer = answer;
        lastAnswerTimestamp = Date.now();
        textDiv.innerHTML = formatAnswerWithBullets(answer);
        paneState = 'answerDisplayed';
      }).catch(() => {
        textDiv.innerHTML = '<span style="color:orange">Error getting answer.</span>';
      });
      return;
    } else {
      // Keep current answer visible
      textDiv.innerHTML = formatAnswerWithBullets(lastAnswer);
    }
    return;
  }

  if (paneState === 'beingRead') {
    if (!currentlyReading) {
      paneState = 'answerDisplayed';
    }
    // Do not clear the pane while being read
    textDiv.innerHTML = formatAnswerWithBullets(lastAnswer);
    return;
  }
}

// === REAL‑TIME OPENAI STREAMING ===
// Abort any in‑flight request when a new one starts
let currentOpenAIController = null;

/**
 * Streams a chat completion token‑by‑token and surfaces partial results.
 * @param {string} question
 * @param {string} contextSnippet
 * @param {(partial:string)=>void} onPartial  Called every time we get new text
 * @param {(finalAns:string)=>void} onDone    Called once streaming is finished
 */
async function streamOpenAIAnswer(question, contextSnippet, onPartial, onDone) {
  const apiKey = await getOpenAIApiKey();
  if (!apiKey) {
    console.error("OpenAI API key not found.");
    return onDone('Error: OpenAI API key not found.');
  }

  // Abort any previous request
  if (currentOpenAIController) currentOpenAIController.abort();
  currentOpenAIController = new AbortController();

  const userPrompt = `Here's the most recent snippet from the live call transcript:\n\n${contextSnippet}\n\nA question was just asked:\n"${question}"\n\nWhat are 2–4 concise, helpful talking points the rep can use to answer it.\nRespond only with bullet points.`.trim();

  const body = {
    model: 'gpt-4o-mini',
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 100
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: currentOpenAIController.signal
  });

  if (!response.ok || !response.body) {
    console.error('Failed to stream from OpenAI', await response.text());
    onDone('Error fetching answer');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let partial = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        if (line.trim() === 'data: [DONE]') {
          onDone(sanitizeAnswer(partial.trim()));
          return;
        }
        if (!line.startsWith('data:')) continue;
        try {
          const dataStr = line.replace(/^data:\s*/, '');
          const payload = JSON.parse(dataStr);
          const token = payload.choices?.[0]?.delta?.content || '';
          if (token) {
            partial += token;
            onPartial(sanitizeAnswer(partial));
          }
        } catch (e) {
          console.error('Error parsing SSE line', e, line);
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // silently ignore
    console.error('Streaming failed', err);
    onDone('Error getting answer');
  }
}