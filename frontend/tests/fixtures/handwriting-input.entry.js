import { registerRootComponent } from 'expo'
import HandwritingStudio from '../../src/handwriting/HandwritingStudio'
import { openFontStudio } from '../../src/handwriting/studioBus.js'

// Isolated browser fixture: local blank draft, no account or diary data.
openFontStudio({})
registerRootComponent(HandwritingStudio)
