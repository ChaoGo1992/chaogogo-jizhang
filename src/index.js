// 超超记账后端：Express + JSON 文件存储 + JWT（零原生依赖）
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const {
  getOrCreateUser, listCategories, listAccounts, getBudget, setBudget,
  listTransactions, addTx, deleteTx, addCategory, exportRows,
} = require('./db')

const app = express()
app.use(cors())
app.use(express.json())

const JWT_SECRET = process.env.JWT_SECRET
const WX_APPID = process.env.WX_APPID
const WX_SECRET = process.env.WX_SECRET

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  try {
    req.uid = jwt.verify(token, JWT_SECRET).uid
    next()
  } catch (e) {
    res.status(401).json({ error: '未登录或登录过期' })
  }
}
const sign = (uid) => jwt.sign({ uid }, JWT_SECRET, { expiresIn: '365d' })

// 登录：小程序传 wx code；H5/PWA 传 device（生成设备号，自用免微信）
app.post('/api/auth/login', async (req, res) => {
  try {
    const { code, device, nickname } = req.body || {}
    let openid = null
    if (code) {
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`
      const r = await fetch(url)
      const wxData = await r.json()
      if (!wxData.openid) return res.status(401).json({ error: '微信登录失败', detail: wxData })
      openid = 'wx_' + wxData.openid
    } else {
      openid = 'h5_' + String(device || 'default')
    }
    const u = getOrCreateUser(openid, nickname)
    res.json({ token: sign(u.id), user: { id: u.id, nickname: u.nickname || nickname || '微信用户' } })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/bootstrap', auth, (req, res) => {
  const month = new Date()
  const m = month.getFullYear() + '-' + String(month.getMonth() + 1).padStart(2, '0')
  res.json({
    categories: listCategories(req.uid).map(({ userId, sort, ...c }) => c),
    accounts: listAccounts(req.uid).map(({ userId, sort, ...a }) => a),
    budget: getBudget(req.uid, m),
  })
})

app.get('/api/transactions', auth, (req, res) => {
  const { from, to } = req.query
  res.json({ list: listTransactions(req.uid, from, to) })
})

app.post('/api/transactions', auth, (req, res) => {
  const { type, amount, categoryId, accountId, toAccountId, note, happenedAt } = req.body || {}
  if (!['expense', 'income', 'transfer'].includes(type)) return res.status(400).json({ error: 'type 非法' })
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: '金额非法（单位分）' })
  if (!happenedAt) return res.status(400).json({ error: '缺少时间' })
  res.json({ id: addTx(req.uid, { type, amount, categoryId: categoryId || null, accountId, toAccountId: toAccountId || null, note: note || '', happenedAt }) })
})

app.delete('/api/transactions/:id', auth, (req, res) => {
  deleteTx(req.uid, req.params.id)
  res.json({ ok: true })
})

app.post('/api/categories', auth, (req, res) => {
  const { name, kind, parentId, icon, color } = req.body || {}
  if (!name || !['expense', 'income'].includes(kind)) return res.status(400).json({ error: '参数非法' })
  res.json(addCategory(req.uid, { name: String(name).slice(0, 6), kind, parentId, icon, color }))
})

app.post('/api/budget', auth, (req, res) => {
  const { month, totalAmount, items } = req.body || {}
  if (!month) return res.status(400).json({ error: '缺少月份' })
  setBudget(req.uid, month, totalAmount, items)
  res.json({ ok: true })
})

app.get('/api/export.csv', auth, (req, res) => {
  const rows = exportRows(req.uid)
  const typeMap = { expense: '支出', income: '收入', transfer: '转账' }
  const lines = [['日期', '类型', '一级分类', '二级分类', '账户', '金额(元)', '备注'].join(',')]
  rows.forEach(t => {
    const cat1 = t.type === 'transfer' ? '转账' : (t.parentName || t.catName || '')
    const cat2 = t.type === 'transfer' ? '' : (t.parentName ? t.catName : '')
    const acc = t.type === 'transfer' ? (t.accName + ' -> ' + t.toAccName) : t.accName
    lines.push([t.happenedAt, typeMap[t.type], cat1, cat2, acc, `="${(t.amount / 100).toFixed(2)}"`, String(t.note || '').replace(/[,\n]/g, ' ')].join(','))
  })
  res.set('Content-Type', 'text/csv; charset=utf-8')
  res.set('Content-Disposition', 'attachment; filename=chaogogo-jizhang.csv')
  res.send('\uFEFF' + lines.join('\n'))
})

app.get('/api/ping', (req, res) => res.json({ pong: true, time: new Date().toISOString() }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server listening on :${PORT}`))
