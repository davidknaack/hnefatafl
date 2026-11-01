import { ClientDependencies, mountLocalClient } from './client'
import { bindOnlineControls } from './onlineControls'
import { resolveRelayEndpoint } from '../online/endpoint'

/** Compose online controls without adding relay/configuration dependencies to local consumers. */
export function mountClient(root: ParentNode, dependencies: ClientDependencies = {}) {
    return mountLocalClient(root, undefined, { ...dependencies,
        online: dependencies.online ?? { endpoint: resolveRelayEndpoint(import.meta.env.VITE_RELAY_URL, location.href) } }, bindOnlineControls)
}
