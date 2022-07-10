import { resolve } from 'path'
import * as process from 'process'
import { promises as fs } from 'fs'
import { execa } from 'execa'
import type { Project } from 'find-packages'
import findPkgs from 'find-packages'
import prompt from 'prompts'
import chalk from 'chalk'
import type { VersionBumpResults } from 'bumpp'
import { versionBump } from 'bumpp'

const preIncludes = ['prepatch', 'preminor', 'premajor', 'prerelease']

interface Pkg {
  dir: string
  name: string
  packageJson: string
  info?: VersionBumpResults
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

const main = async() => {
  const pkgs = resolvePkgs(await findPkgs(process.cwd()))
  let selectPkgs: Pkg[]
  if (pkgs.length <= 1) {
    selectPkgs = pkgs
  }
  else {
    // select publish pkg
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
  try {
    console.log(chalk.magenta('test ...'))
    await Promise.all(selectPkgs.map(pkg => execa('pnpm', ['run', 'test'], { cwd: pkg.dir })))
    console.log(chalk.green('test success'))
  }
  catch (e: any) {
    console.log(chalk.red('test failed !'))
    console.log(e?.stdout)
    process.exit(1)
  }

  // build dist
  try {
    console.log(chalk.magenta('build ...'))
    await Promise.all(selectPkgs.map(selectPkg => execa('pnpm', ['run', 'build'], { cwd: selectPkg.dir })))
    console.log(chalk.green('build success'))
  }
  catch (e: any) {
    console.log(chalk.red('build failed !'))
    console.log(e?.stdout)
    process.exit(1)
  }

  let globalInfo: VersionBumpResults
  // change version
  try {
    console.log(chalk.magenta('change version ...'))
    for (const selectPkg of selectPkgs) {
      const info = await versionBump({
        release: versionType,
        preid: releaseType,
        cwd: selectPkg.dir,
      })
      selectPkg.info = info
      // auto generate version file
      await generateVersionFile(info.newVersion, selectPkg.dir)
    }
    // change global version
    globalInfo = await versionBump({
      release: versionType,
      preid: releaseType,
      cwd: process.cwd(),
    })
    console.log(chalk.green('change version success'))
  }
  catch (e) {
    console.log(chalk.red('change version failed !'))
    process.exit(1)
  }
  let commit
  // add tag check pkg is single
  if (selectPkgs.length === 1) {
    const pkg = pkgs[0]
    if (pkg.info) {
      const tag = `${pkg.name}@${pkg.info.newVersion}`
      // add tag
      try {
        console.log(chalk.magenta('add tag ...'))
        await execa('git', ['tag', '-a', tag, '-m', `release: ${tag}`])
        await execa('git', ['push', 'origin', tag])
        console.log(chalk.green('add tag success'))
        commit = `release: v${tag}`
      }
      catch (e: any) {
        console.log(chalk.red('add tag failed !'))
        console.log(e?.stdout)
        process.exit(1)
      }
    }
  }
  else {
    // input your tag version
    let tagVersion: string
    if (pkgs.length !== selectPkgs.length) {
      const tagInfoVersion = await prompt({
        type: 'text',
        name: 'tagVersion',
        message: 'input your tag version default is global version',
        initial: globalInfo.newVersion,
      })
      tagVersion = tagInfoVersion.tagVersion
    }
    else {
      tagVersion = globalInfo.newVersion
    }
    try {
      console.log(chalk.magenta('add tag ...'))
      await execa('git', ['tag', '-a', tagVersion, '-m', `release: v${tagVersion}`])
      await execa('git', ['push', 'origin', tagVersion])
      console.log(chalk.green('add tag success'))
      commit = `release: v${tagVersion}`
    }
    catch (e: any) {
      console.log(chalk.red('add tag failed !'))
      console.log(e?.stdout)
      process.exit(1)
    }
  }

  // generate changelog
  try {
    console.log(chalk.magenta('generate changelog ...'))
    for (const selectPkg of selectPkgs) {
      await execa('conventional-changelog', [
        '-i', resolve(selectPkg.dir, 'CHANGELOG.md'),
        '-s', '-r', '0',
        '-p', 'angular',
        '-k', resolve(selectPkg.dir, 'package.json'),
        '--commit-path', selectPkg.dir],
      {
        cwd: process.cwd(),
      })
    }
    console.log(chalk.green('generate changelog success'))
  }
  catch (e: any) {
    // TODO
    console.log(chalk.red('generate changelog failed !'))
    console.log(e?.stdout)
    process.exit(1)
  }
  // commit
  try {
    console.log(chalk.magenta('commit ...'))
    await execa('git', ['add', '.'])
    await execa('git', ['commit', '-m', commit || 'release: change version'])
    console.log(chalk.green('commit success'))
  }
  catch (e: any) {
    console.log(chalk.red('commit failed !'))
    console.log(e?.stdout)
    process.exit(1)
  }

  // publish
  try {
    console.log(chalk.magenta('publish ...'))
    const args: string[] = []
    if (releaseType) {
      args.push('--tag')
      args.push(releaseType)
    }
    args.push('--filter')
    args.push('./packages/**')
    await execa('pnpm', ['publish', '--no-git-checks', ...args], { cwd: process.cwd() })
    console.log(chalk.green('publish success'))
  }
  catch (e) {
    // TODO
    console.log(chalk.red('publish failed !'))
  }
}

main().then(() => {
  // 成功
})
