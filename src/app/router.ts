export type Route =
  | '/setup'
  | '/unlock'
  | '/dashboard'
  | '/income'
  | '/expenses'
  | '/budget'
  | '/debt'
  | '/reports'
  | '/afford'
  | '/insights'
  | '/settings';

type RouteHandler = (params?: Record<string, string>) => HTMLElement | Promise<HTMLElement>;

const routes = new Map<Route, RouteHandler>();
let routeChangeCallback: ((route: Route) => void) | null = null;

export function onRouteChange(cb: (route: Route) => void): void {
  routeChangeCallback = cb;
}

export function register(route: Route, handler: RouteHandler): void {
  routes.set(route, handler);
}

export function navigate(route: Route): void {
  history.pushState({}, '', `#${route}`);
  render(route);
}

// Replaces the current history entry rather than pushing — used when transitioning
// from a terminal gate (setup/unlock) to the main app so Back doesn't return there.
export function navigateReplace(route: Route): void {
  history.replaceState({}, '', `#${route}`);
  render(route);
}

export function currentRoute(): Route {
  const hash = location.hash.slice(1);
  if (!hash) return '/dashboard';
  return hash as Route;
}

async function render(route: Route): Promise<void> {
  routeChangeCallback?.(route);
  const content = document.getElementById('app-content');
  if (!content) return;

  const handler = routes.get(route);
  if (!handler) {
    content.innerHTML = '';
    const notFound = document.createElement('p');
    notFound.className = 'text-muted';
    notFound.textContent = `Page not found: ${route}`;
    content.appendChild(notFound);
    return;
  }

  content.innerHTML = '';
  const el = await handler();
  content.appendChild(el);
}

let listenerAdded = false;
export function initRouter(): void {
  if (!listenerAdded) {
    listenerAdded = true;
    window.addEventListener('popstate', () => render(currentRoute()));
  }
  render(currentRoute());
}
