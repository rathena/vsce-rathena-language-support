# Visual Studio Code rAthena Language Support

This extension provides rAthena Scripting Language syntax highlighting and code snippets.

## File extension support

rAthena Language Support automatically highlights files with .rascript extension.

Files that start with `//===== rAthena Script` or `//!rathena` will also be automatically detected as an rAthena script.

## Snippets

The following are code snippets provided by rAthena Language Support.

* `defnpc`, `defnpcfloat`, `defwarp`, and `defshop` (In-game objects definition)
* `deffunction` (Function definition)
* `On:` event handler snippet
* `for`, `while`, `do` flow control snippet

## Installation

You can install the extension directly from Visual Studio Code's extension menu or by visiting the [Marketplace](https://marketplace.visualstudio.com/items?itemName=rAthena.rathena-language-support).

## Contributing

Feel free to open issues or PRs. We welcome your contributions, especially efforts to standardize this extension's grammar definition.

## License

This extension is licensed under the MIT license.

## Special thanks

This extension was initially ported from [JoWei's language-athena](https://github.com/JoWei/language-athena) for Atom editor and published via VS Marketplace by secretdataz, a member of the rAthena Dev Team. The [repository](https://github.com/secretdataz/athena-language-support) was then archived and is no longer maintained. This extension is now maintained by the rAthena Dev Team.
