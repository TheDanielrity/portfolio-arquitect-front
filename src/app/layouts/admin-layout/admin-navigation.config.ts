export interface AdminPage {
  readonly label: string;
  readonly description: string;
  readonly notFound?: boolean;
}
export interface AdminNavigationItem extends AdminPage {
  readonly path: string;
  readonly route: string;
  readonly exact: boolean;
  readonly iconPath: string;
}

export const ADMIN_NAVIGATION: readonly AdminNavigationItem[] = [
  {
    path: '',
    route: '/admin',
    label: 'Resumen',
    description:
      'Tu espacio de trabajo está preparado. El resumen de actividad estará disponible próximamente.',
    exact: true,
    iconPath: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  },
  {
    path: 'projects',
    route: '/admin/projects',
    label: 'Proyectos',
    description:
      'Aquí podrás organizar y presentar tus proyectos. Esta sección estará disponible próximamente.',
    exact: false,
    iconPath: 'M3 21h18 M5 21V5l7-2v18 M12 8h7v13 M8 7v1 M8 11v1 M8 15v1 M15 12h1 M15 16h1',
  },
  {
    path: 'taxonomy',
    route: '/admin/taxonomy',
    label: 'Categorías y etiquetas',
    description: 'Consulta y crea la clasificación de tus proyectos.',
    exact: false,
    iconPath: 'M3 3h8l10 10-8 8L3 11z M7 7h1',
  },
  {
    path: 'profile',
    route: '/admin/profile',
    label: 'Perfil',
    description:
      'Aquí podrás gestionar tu información profesional. Esta sección estará disponible próximamente.',
    exact: false,
    iconPath: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  },
  {
    path: 'services',
    route: '/admin/services',
    label: 'Servicios',
    description:
      'Aquí podrás presentar tus servicios profesionales. Esta sección estará disponible próximamente.',
    exact: false,
    iconPath: 'M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3',
  },
  {
    path: 'settings',
    route: '/admin/settings',
    label: 'Configuración',
    description:
      'Aquí podrás administrar la configuración de tu portafolio. Esta sección estará disponible próximamente.',
    exact: false,
    iconPath: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M10 16v4',
  },
];
