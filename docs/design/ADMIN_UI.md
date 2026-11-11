# Dirección visual del administrador

Referencia aprobada: [ZIP administrativo de Figma Make](source/Admin%20panel%20for%20architecture%20portfolio.zip).

Estas reglas son permanentes y exclusivas de administración, incluido inicio de sesión, resumen, proyectos y sus pestañas, categorías y etiquetas, perfil, servicios, configuración, menús móviles, diálogos y subida de archivos. No modificar PUBLIC_UI.md ni estilos, tokens o componentes públicos para aplicarlas.

## Accesibilidad visual obligatoria

- Objetivo mínimo: WCAG 2.2 nivel AA. No afirmar conformidad completa basándose solo en una paleta o pruebas unitarias.
- Texto normal, labels, placeholders y ayudas: contraste mínimo de 4.5:1 con su fondo real. Texto grande: mínimo 3:1. Procurar 7:1 para texto principal y secundario cuando sea posible.
- Contornos necesarios para identificar controles, iconos informativos y foco: mínimo 3:1 con colores adyacentes. No medir colores con transparencia sin componerlos sobre el fondo real.
- Textos oscuros y legibles, con pesos claros. No aclarar ayudas o placeholders hasta volverlos difíciles de leer. Los placeholders no sustituyen labels persistentes.
- Diferenciar fondo de página, tarjetas, recuadros y campos mediante superficies y límites visibles. Evitar fieldsets transparentes sobre el fondo general cuando agrupan contenido editable.
- Todos los botones, incluidos principales, secundarios, iconos, pestañas, enlaces con apariencia de botón y deshabilitados, conservan borde negro sólido de al menos 1 px en todos los estados. Implementación actual: 1.5 px. No cambiar el borde a discontinuo en disabled.
- Hover distinguible mediante subrayado además del cambio de fondo. Focus visible con contorno negro y halo blanco, sin quedar completamente oculto por contenido fijo o contenedores con scroll.
- Disabled mantiene texto legible y opacidad completa; usar fondo diferenciado, cursiva e indicación nativa disabled. No volverlo interactivo ni sustituir disabled únicamente por estilos.
- Error incluye mensaje asociado al campo y señal adicional al color, por ejemplo borde doble. Conservar aria-invalid, aria-describedby y mensajes de estado existentes.
- Selección, publicación, errores y progreso no pueden comunicarse exclusivamente mediante color: incluir texto, iconos comprensibles, borde, subrayado o estado semántico según corresponda.
- Conservar navegación por teclado, orden de foco, nombres accesibles, alternativas al arrastre, reduced-motion, zoom de texto al 200 % y reflujo a 320 CSS px. Objetivos interactivos de al menos 24 × 24 CSS px, salvo excepciones documentadas de WCAG; preferir 44 px cuando sea práctico.

## Tokens y alcance

- Fondo: #e9eae5; superficie: #fff; texto: #111; secundario: #343834.
- Borde de superficie: #74786f; borde de campo: #454842; borde de botón: #000.
- Acento: #374526; hover: #e3e5dc; selección: #d8dfcb; error: #86251e.
- Tipografía existente: Century Gothic mediante --font-sans. Respetar tamaños responsivos y proporciones del proyecto.
- Tokens en admin-theme.scss; reglas compartidas en admin-accessibility.scss, limitadas a app-admin-layout y app-admin-login. Conservar reglas específicas cuando mejoren la legibilidad sin contradecir estos mínimos.

El editor mantiene cuatro áreas, navegación libre y barra de guardado persistente. En móvil la navegación se distribuye en dos columnas. Los grupos de archivos comparten un solo componente y una cola. Evitar tarjetas enormes y decoraciones.

## Validación

Medir contraste de texto normal, secundario, botones, errores, controles y estados sobre fondos reales. Verificar teclado, foco, disabled, mensajes, zoom y móvil en navegador. Ejecutar pruebas funcionales relevantes, lint, formato, TypeScript y build. Registrar qué se comprobó y cualquier limitación; una prueba automatizada no certifica todo WCAG.

Referencia normativa: [WCAG 2.2, guía de criterios del W3C](https://www.w3.org/WAI/WCAG22/quickref/).

Ver [experiencia del editor](../admin-ux.md) para comportamiento y límites.