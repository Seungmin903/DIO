import { registerRootComponent } from 'expo'
import { initializeErrorHandling } from './src/stability/errorHandling'

// Resolve App from this checkout even when node_modules is shared via a junction.
initializeErrorHandling()
const AppRoot = require('./src/stability/AppRoot').default
registerRootComponent(AppRoot)
