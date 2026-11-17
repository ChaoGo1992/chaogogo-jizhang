// 数据层：JSON 文件存储（零原生依赖，Windows/Linux 通用）
// 数据量级：个人记账每天几十条，单文件 JSON + 同步写盘完全够用，备份即拷贝文件
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'data.json')

function load() {
  if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  return { seq: {}, users: [], categories: [], accounts: [], transactions: [], budgets: [], budgetItems: [] }
}
const data = load()

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data))
}
function nextId(table) {
  data.seq[table] = (data.seq[table] || 0) + 1
  return data.seq[table]
}

// ---------- 种子数据（与前端 mock 一致） ----------
const SEED = {
  expense: [
    ['食品酒水', '🍜', '#FF6B35', [['早午晚餐', '🍚'], ['零食饮料', '🥤'], ['烟酒茶', '🍵']]],
    ['交通出行', '🚇', '#3B82F6', [['公共交通', '🚌'], ['打车', '🚕'], ['加油', '⛽']]],
    ['购物消费', '🛍️', '#8B5CF6', [['服饰鞋帽', '👕'], ['数码家电', '📱'], ['日用百货', '🧺']]],
    ['居家生活', '🏠', '#10B981', [['房租水电', '💡'], ['家居用品', '🛋️']]],
    ['娱乐休闲', '🎮', '#EC4899', [['电影演出', '🎬'], ['游戏', '🕹️'], ['旅行', '✈️']]],
    ['医疗健康', '🏥', '#EF4444', [['药品', '💊'], ['诊疗', '🩺']]],
    ['教育文化', '📚', '#F59E0B', [['书籍课程', '📖']]],
    ['人情社交', '🎁', '#14B8A6', [['红包礼金', '🧧'], ['请客送礼', '🎀']]],
    ['其他支出', '📦', '#6B7280', [['其他', '📦']]],
  ],
  income: [
    ['工资', '💰', '#22C55E'], ['奖金', '🎊', '#16A34A'], ['副业', '💼', '#059669'],
    ['红包', '🧧', '#DC2626'], ['理财', '📈', '#0891B2'], ['其他收入', '✨', '#6B7280'],
  ],
  accounts: [
    ['招商储蓄卡', '🏦', '银行卡', 1580000], ['支付宝', '🅰️', '电子支付', 320000],
    ['微信钱包', '💚', '电子支付', 180000], ['现金', '💵', '现金', 50000],
  ],
}

function seedUser(userId) {
  const now = new Date()
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  SEED.expense.forEach(([name, icon, color, subs], pi) => {
    const pid = nextId('categories')
    data.categories.push({ id: pid, userId, parentId: null, kind: 'expense', name, icon, color, sort: pi })
    subs.forEach(([sub, sIcon], si) => {
      data.categories.push({ id: nextId('categories'), userId, parentId: pid, kind: 'expense', name: sub, icon: sIcon, color, sort: si })
    })
  })
  SEED.income.forEach(([name, icon, color], i) => {
    data.categories.push({ id: nextId('categories'), userId, parentId: null, kind: 'income', name, icon, color, sort: i })
  })
  SEED.accounts.forEach(([name, icon, type, bal], i) => {
    data.accounts.push({ id: nextId('accounts'), userId, name, icon, type, initialBalance: bal, sort: i })
  })
  data.budgets.push({ id: nextId('budgets'), userId, month, totalAmount: 800000 })
  save()
}

function getOrCreateUser(openid, nickname) {
  let u = data.users.find(x => x.openid === openid)
  if (!u) {
    u = { id: nextId('users'), openid, nickname: nickname || '', createdAt: new Date().toISOString() }
    data.users.push(u)
    seedUser(u.id)
  } else if (nickname && !u.nickname) {
    u.nickname = nickname
    save()
  }
  return u
}

// ---------- 业务查询 ----------
const listCategories = (uid) => data.categories.filter(c => c.userId === uid).sort((a, b) => a.sort - b.sort)
const listAccounts = (uid) => data.accounts.filter(a => a.userId === uid).sort((a, b) => a.sort - b.sort)
const getBudget = (uid, month) => {
  const b = data.budgets.find(x => x.userId === uid && x.month === month)
  return {
    month,
    totalAmount: b ? b.totalAmount : 0,
    items: data.budgetItems.filter(x => x.userId === uid && x.month === month).map(({ id, categoryId, amount }) => ({ id, categoryId, amount })),
  }
}
const setBudget = (uid, month, totalAmount, items) => {
  data.budgets = data.budgets.filter(x => !(x.userId === uid && x.month === month))
  data.budgets.push({ id: nextId('budgets'), userId: uid, month, totalAmount: totalAmount || 0 })
  data.budgetItems = data.budgetItems.filter(x => !(x.userId === uid && x.month === month))
  ;(items || []).forEach(it => data.budgetItems.push({ id: nextId('budgetItems'), userId: uid, month, categoryId: it.categoryId, amount: it.amount }))
  save()
}
const listTransactions = (uid, from, to) =>
  data.transactions.filter(t => t.userId === uid && t.happenedAt >= from && t.happenedAt < to)
    .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
    .map(({ userId, ...rest }) => rest)
const addTx = (uid, t) => {
  const row = { id: nextId('transactions'), userId: uid, ...t }
  data.transactions.push(row)
  save()
  return row.id
}
const deleteTx = (uid, id) => {
  data.transactions = data.transactions.filter(t => !(t.userId === uid && t.id === Number(id)))
  save()
}
const addCategory = (uid, c) => {
  const row = { id: nextId('categories'), userId: uid, parentId: c.parentId || null, kind: c.kind, name: c.name, icon: c.icon || '🏷️', color: c.color || '#6B7280', sort: 99 }
  data.categories.push(row)
  save()
  return { id: row.id }
}
// 导出：流水 + 分类/账户名称联表
function exportRows(uid) {
  return data.transactions.filter(t => t.userId === uid)
    .sort((a, b) => a.happenedAt.localeCompare(b.happenedAt))
    .map(t => {
      const cat = data.categories.find(c => c.id === t.categoryId)
      const parent = cat && cat.parentId ? data.categories.find(c => c.id === cat.parentId) : null
      const acc = data.accounts.find(a => a.id === t.accountId)
      const toAcc = t.toAccountId ? data.accounts.find(a => a.id === t.toAccountId) : null
      return { ...t, catName: cat ? cat.name : '', parentName: parent ? parent.name : '', accName: acc ? acc.name : '', toAccName: toAcc ? toAcc.name : '' }
    })
}

module.exports = { getOrCreateUser, listCategories, listAccounts, getBudget, setBudget, listTransactions, addTx, deleteTx, addCategory, exportRows }
