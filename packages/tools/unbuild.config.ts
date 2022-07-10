import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
  ],
  rollup: {
    emitCJS: true,
  },
  declaration: true,
  clean: true,
  externals: [],
})
