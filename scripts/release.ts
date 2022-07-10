import { resolve } from 'path'
import * as process from 'process'
import { promises as fs } from 'fs'
import { execa } from 'execa'
import type { Project } from 'find-packages'
import findPkgs from 'find-packages'
import prompt from 'prompts'
import chalk from 'chalk'
import { versionBump } from 'bumpp'
import minimist from 'minimist'

const preIncludes = ['prepatch', 'preminor', 'premajor', 'prerelease']

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

const generateVersionFile = async(version: string, cwd: string) => {
  const versionDir = resolve(cwd, 'src')
  const existDir = await fs.stat(versionDir).then(stat => stat.isDirectory()).catch(() => false)
  if (existDir) {
    const versionFile = resolve(cwd, 'src/version.ts')
    // 判断文件是否存在，存在删除，重新创建
    const exists = await fs.stat(versionFile).then(stat => stat.isFile()).catch(() => false)
    if (exists)
      await fs.unlink(versionFile)
    await fs.writeFile(versionFile, `export default '${version}'\n`)
  }
}

const args = minimist(process.argv.slice(2))

const main = async() => {
  const pkgs = resolvePkgs(await findPkgs(process.cwd()))
  let selectPkgs: Pkg[]
  if (pkgs.length <= 1) {
    selectPkgs = pkgs
  }
  else {
    // 选择要发布的包
    const sePkgs = await prompt({
      type: 'multiselect',
      name: 'selectPkgs',
      message: 'choose package to release',
      choices: pkgs.map(pkg => ({
        title: pkg.name,
        value: pkg,
      })),
    })
    selectPkgs = sePkgs.selectPkgs as Pkg[]
  }
  if (!selectPkgs || selectPkgs.length < 1) {
    console.log(chalk.red('please select release package !'))
    console.log()
    process.exit(1)
  }

  const { versionType, releaseType } = await prompt([
    {
      type: 'select',
      name: 'versionType',
      message: 'please select release version type',
      choices: [
        {
          title: 'patch',
          value: 'patch',
        },
        {
          title: 'minor',
          value: 'minor',
        },
        {
          title: 'major',
          value: 'major',
        },
        {
          title: 'prepatch',
          value: 'prepatch',
        },
        {
          title: 'preminor',
          value: 'preminor',
        },
        {
          title: 'premajor',
          value: 'premajor',
        },
        {
          title: 'prerelease',
          value: 'prerelease',
        },
      ],
    },
    {
      type: prev => preIncludes.includes(prev) ? 'select' : null,
      name: 'releaseType',
      message: 'please select pre release type',
      choices: [
        {
          title: 'beta',
          value: 'beta',
        },
        {
          title: 'alpha',
          value: 'alpha',
        },
        {
          title: 'rc',
          value: 'rc',
        },
        {
          title: 'next',
          value: 'next',
        },
      ],
    },
  ])

  if (!versionType) {
    console.log(chalk.red('please select pre release version type !'))
    console.log()
    process.exit(1)
  }
  // use test

  // build dist
  for (const selectPkg of selectPkgs)
    await execa('pnpm', ['run', 'build'], { cwd: selectPkg.dir })

  // change version
  for (const selectPkg of selectPkgs) {
    const info = await versionBump({
      release: versionType,
      preid: releaseType,
      cwd: selectPkg.dir,
    })
    // 自动在当前的src目录生成一个version.ts的文件
    await generateVersionFile(info.newVersion, selectPkg.dir)
  }
  // add tag
}

main().then(() => {
  // 成功
})
