const { withPodfile } = require('expo/config-plugins')

module.exports = function withHandwritingIos(config) {
  return withPodfile(config, mod => {
    const declaration = "pod 'onnxruntime-objc', :modular_headers => true"
    const content = mod.modResults.contents
    if (content.includes(declaration)) return mod
    const anchor = /^([ \t]*)use_expo_modules![ \t]*(\r?)$/m
    if (!anchor.test(content)) throw new Error('Cannot find the Expo app target for the handwriting pod.')
    mod.modResults.contents = content.replace(anchor, (line, indent, cr) => `${line}\n${indent}${declaration}${cr}`)
    return mod
  })
}
