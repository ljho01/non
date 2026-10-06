import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import { Workspace } from './-ui/workspace'
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Workspace,
})
