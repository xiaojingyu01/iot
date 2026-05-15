import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * uni 编译 mp-weixin 时，外分包 require.async 引用的 book.js 可能未写入分包目录。
 * 将 src/packages/mnovel-N/book.js 拷入产物（book.js 为自包含 module.exports，勿再 require json）。
 */
function syncMnovelBooksIntoMiniProgramRoot(dir) {
  if (!dir || !fs.existsSync(path.join(dir, 'app.json'))) return
  const srcPkgs = path.join(__dirname, 'src', 'packages')
  if (!fs.existsSync(srcPkgs)) return
  for (const name of fs.readdirSync(srcPkgs)) {
    if (!/^mnovel-\d+$/.test(name)) continue
    const srcJs = path.join(srcPkgs, name, 'book.js')
    const destDir = path.join(dir, 'packages', name)
    if (!fs.existsSync(srcJs)) continue
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(srcJs, path.join(destDir, 'book.js'))
    try {
      fs.unlinkSync(path.join(destDir, 'book.json'))
    } catch {
      /* 无旧文件 */
    }
  }
}

function copyMnovelBooksToMpWeixin() {
  let outDir = ''
  return {
    name: 'ev-copy-mnovel-books',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    writeBundle(outputOptions) {
      const dir = outputOptions.dir || outDir
      syncMnovelBooksIntoMiniProgramRoot(dir)
    },
    closeBundle() {
      syncMnovelBooksIntoMiniProgramRoot(outDir)
    }
  }
}

/** 与 .env 中 VITE_API_PREFIX 一致；空字符串表示不加前缀 */
function normalizeApiPrefix(raw) {
  if (raw === undefined || raw === null) {
    return '/iot-app'
  }
  const s = String(raw).trim()
  if (s === '') {
    return ''
  }
  return s.replace(/\/$/, '')
}

/** 网关或直连主机根地址，勿带业务前缀 /iot-app */
function normalizeApiBase(raw) {
  const s = raw !== undefined && raw !== null ? String(raw).trim() : ''
  if (s) {
    return s.replace(/\/$/, '')
  }
  return 'http://127.0.0.1:8080'
}

/** 文件服务对外 HTTPS 根（无尾斜杠），用于把 http 内网文件 URL 换成可展示的地址 */
function normalizeFilePublicOrigin(raw) {
  if (raw === undefined || raw === null) return ''
  return String(raw).trim().replace(/\/$/, '')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPrefix = normalizeApiPrefix(env.VITE_API_PREFIX)
  const apiBase = normalizeApiBase(env.VITE_API_BASE_URL)
  const fileOrigin = normalizeFilePublicOrigin(env.VITE_FILE_PUBLIC_ORIGIN)

  return {
    plugins: [uni(), copyMnovelBooksToMpWeixin()],
    define: {
      __EV_API_PREFIX__: JSON.stringify(apiPrefix),
      __EV_API_BASE_URL__: JSON.stringify(apiBase),
      __EV_FILE_PUBLIC_ORIGIN__: JSON.stringify(fileOrigin)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      port: 5173
    }
  }
})
