I'm gonna build an agent inside of here. It's gonna be my own agent, and it's gonna do bookkeeping for me. I'm gonna build this on top of pi.

I will need a way to interact with this agent, like a front end chat interface, and I wanna use Express for that and just build a simple HTML JavaScript app to let me do that.

I'm gonna show you the architecture that I have in mind for the project below. Make sure you do some research on what pi is so that you understand how to build this properly.

.
├── agent-home/  # point pi to this dir
│   ├── AGENTS.md    # point pi to this as its agents file
│   ├── brain/brain.md  # this is the agent knowledge of bookkeeping
│   ├── memory/
│   │   ├── images/  # receipts / invoices
│   │   ├── expenses.json
│   │   └── facts.json
│   ├── skills/
│   │   ├── send-email/ # placeholder
│   │   └── web-fetch/ # placeholder
│   └── settings.json
├── server.ts
├── public/index.html
└── package.json

Style guidelines:
- make the chat interface dark mode
- use the fontend-design skill
- use node v22



