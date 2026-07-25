<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tipografía

Usa exclusivamente **Mona Sans** de Google Fonts, cargada via `next/font/google`. No uses ninguna otra fuente.

- Variable CSS: `--font-mona-sans`
- Subsets: latin
- Fallback: system-ui, sans-serif
- Aplicada globalmente con la clase `font-sans` en el `<body>`

# Componentes UI — HeroUI OBLIGATORIO

**TODOS los componentes de interfaz deben ser exclusivamente de HeroUI.** Está estrictamente prohibido usar componentes de cualquier otra librería (shadcn, Radix, MUI, Chakra, etc.).

- Se cuenta con el MCP de HeroUI (`mcp__heroui-react__*`) — úsalo para consultar documentación, componentes disponibles y estilos antes de implementar cualquier UI.
- HeroUI v3 (Beta) es la versión en uso. Consulta siempre `get_docs` y `get_component_docs` antes de escribir código de UI.
- No inventes props ni APIs — verifica con el MCP.

# Base de datos — Supabase

Se cuenta con el MCP de Supabase (`mcp__supabase__*`) para gestionar la base de datos. Úsalo para consultar tablas, ejecutar migraciones y configurar el proyecto. No hagas suposiciones sobre el esquema — consulta `list_tables` primero.

La aplicacion esta pensada para que se use 90% en mobile asegurate que el disenio sea mobile first.