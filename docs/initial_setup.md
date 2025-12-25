    "dev": "tsx watch src/index.ts", // starts the server with hot-reloading
    "build": "tsc -p tsconfig.server.json", // builds the server code
    "start": "node dist/index.js", // starts the built server
    "build:client": "webpack --mode production", // builds the client code
    "dev:client": "webpack serve --mode development", // starts the client dev server
    "analyze:client": "ANALYZE=true webpack --mode production", // builds the client and opens bundle analyzer
    "lint": "eslint .", // lints all files
    "lint:fix": "eslint . --fix", // lints and auto-fixes all files
    "format": "prettier . --check", // checks formatting of all files
    "format:fix": "prettier . --write", // auto-formats all files