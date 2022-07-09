import { resolve } from 'path'
import * as process from 'process'
import type { Project } from 'find-packages'
import findPkgs from 'find-packages'

interface Pkg {
  dir: string
  name: string
  packageJson: string
}

const resolvePkgs = (pkgs: Project[]): Pkg[] => {
  return pkgs
    .filter(item => item.dir !== process.cwd())
    .map(pkg => ({
      dir: pkg.dir,
      name: pkg.manifest.name,
      packageJson: resolve(pkg.dir, 'package.json'),
    } as Pkg))
}

const main = async() => {
  const pkgs = resolvePkgs(await findPkgs(process.cwd()))
  console.log(pkgs)
}

main().then(() => {
  // 成功
})
