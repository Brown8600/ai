import { loadConfig } from '../config.js'
import { createDatabase } from '../db.js'
import { hashAdminPassword } from '../admin-password.js'

const seedProducts = [
  { category: '数码', name: '降噪头戴式耳机', subtitle: '40 小时续航，沉浸式空间音频', description: '自适应降噪与通透模式，支持多设备连接。', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800', badge: '热卖', sales: 2380, skus: [['曜石黑', 69900, 89900], ['云雾白', 69900, 89900]] },
  { category: '家居', name: '轻量便携咖啡杯', subtitle: '双层隔热，随行不漏水', description: '食品接触级内胆，适合通勤与短途旅行。', image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800', badge: '新品', sales: 985, skus: [['奶油白', 8900, 12900], ['森林绿', 8900, 12900]] },
  { category: '数码', name: '机械键盘 75 配列', subtitle: '热插拔轴体，三模低延迟连接', description: '紧凑布局兼顾功能区，支持有线、蓝牙和 2.4G。', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800', badge: null, sales: 1684, skus: [['深空灰', 45900, null], ['冰川蓝', 45900, null]] },
  { category: '美妆', name: '高保湿修护面霜', subtitle: '敏感肌适用，长效锁水', description: '温和配方帮助改善干燥，建议先做局部测试。', image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=800', badge: null, sales: 3271, skus: [['50ml', 15900, 19900]] },
  { category: '服饰', name: '纯棉休闲圆领卫衣', subtitle: '宽松剪裁，柔软亲肤', description: '基础版型适合日常叠穿，建议按尺码表选择。', image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800', badge: '推荐', sales: 746, skus: [['雾霾蓝', 19900, null], ['燕麦灰', 19900, null], ['经典黑', 19900, null]] },
  { category: '食品', name: '每日坚果礼盒', subtitle: '7 种坚果果干，独立小包装', description: '每日独立包装，开袋即食，请置于阴凉干燥处。', image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=800', badge: null, sales: 4512, skus: [['30袋装', 11900, 14900]] },
  { category: '数码', name: '便携式投影仪', subtitle: '1080P 高清，小空间也能看大片', description: '自动对焦与梯形校正，适合卧室和露营使用。', image: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=800', badge: '热卖', sales: 1260, skus: [['标准版', 129900, 159900], ['套装版', 149900, 179900]] },
  { category: '家居', name: '智能护眼台灯', subtitle: '无频闪调光，支持定时与夜灯', description: '柔和照明覆盖书桌，支持多档色温调节。', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800', badge: null, sales: 612, skus: [['白色', 12900, 16900], ['黑色', 12900, 16900]] },
  { category: '美妆', name: '清透防晒乳', subtitle: '轻薄不黏腻，日常通勤防护', description: '清爽肤感，适合日常通勤和户外活动。', image: 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?w=800', badge: '新品', sales: 1904, skus: [['40ml', 9900, 12900]] },
  { category: '服饰', name: '轻户外冲锋衣', subtitle: '防风防泼水，春秋季轻量穿搭', description: '简洁版型适合通勤与短途徒步，内含可调节帽檐。', image: 'https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=800', badge: '推荐', sales: 438, skus: [['M', 32900, null], ['L', 32900, null], ['XL', 32900, null]] },
  { category: '食品', name: '冻干草莓燕麦', subtitle: '低糖配方，早餐与下午茶之选', description: '独立小袋包装，搭配酸奶或牛奶食用。', image: 'https://images.unsplash.com/photo-1517093728432-a0440f8d45af?w=800', badge: null, sales: 806, skus: [['500g', 7900, 9900]] },
  { category: '运动', name: '高密度瑜伽垫', subtitle: '防滑回弹，居家运动更舒适', description: '加厚缓冲层减轻膝盖压力，适合瑜伽和拉伸。', image: 'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=800', badge: null, sales: 527, skus: [['湖水蓝', 15900, 19900], ['石墨灰', 15900, 19900]] },
  { category: '图书', name: '给孩子的科学绘本', subtitle: '用故事理解身边的科学', description: '适合 3 至 8 岁亲子阅读，彩色插图和互动问答。', image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800', badge: '推荐', sales: 215, skus: [['全 4 册', 8900, 10900]] }
] as const

const config = loadConfig()
const db = createDatabase(config.DATABASE_URL)

try {
  await db.transaction(async client => {
    const names = ['数码', '家居', '美妆', '服饰', '食品', '运动', '图书']
    for (const [sortOrder, name] of names.entries()) {
      await client.query(
        `INSERT INTO categories(name, sort_order) VALUES ($1, $2)
         ON CONFLICT(name) DO UPDATE SET sort_order = EXCLUDED.sort_order, enabled = true`,
        [name, sortOrder]
      )
    }
    for (const product of seedProducts) {
      const productResult = await client.query<{ id: string }>(
        `INSERT INTO products(category_id, name, subtitle, description, image_url, badge, sales)
         VALUES ((SELECT id FROM categories WHERE name = $1), $2, $3, $4, $5, $6, $7)
         ON CONFLICT(name) DO UPDATE SET updated_at = products.updated_at
         RETURNING id`,
        [product.category, product.name, product.subtitle, product.description, product.image, product.badge, product.sales]
      )
      const productId = productResult.rows[0]!.id
      for (const [specification, priceCents, originalPriceCents] of product.skus) {
        await client.query(
          `INSERT INTO product_skus(product_id, specification, price_cents, original_price_cents, stock)
           VALUES ($1, $2, $3, $4, 1000)
           ON CONFLICT(product_id, specification) DO NOTHING`,
          [productId, specification, priceCents, originalPriceCents]
        )
      }
    }

    if (config.ADMIN_SEED_USERNAME && config.ADMIN_SEED_PASSWORD) {
      const username = config.ADMIN_SEED_USERNAME.trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) throw new Error('ADMIN_SEED_USERNAME must be 3-50 lowercase letters, digits, dots, underscores or hyphens')
      const passwordHash = await hashAdminPassword(config.ADMIN_SEED_PASSWORD)
      await client.query(
        `INSERT INTO admin_users(username,password_hash,display_name,role)
         VALUES($1,$2,$3,'SUPER_ADMIN') ON CONFLICT(username) DO NOTHING`,
        [username, passwordHash, config.ADMIN_SEED_DISPLAY_NAME]
      )
    }

    const demoUsers = [
      { openid: 'dev-seed-alice', nickname: '演示用户 Alice', name: '张小雨', phone: '13900000001', detail: '世纪大道 100 号' },
      { openid: 'dev-seed-bob', nickname: '演示用户 Bob', name: '李明', phone: '13900000002', detail: '软件园路 20 号' },
      { openid: 'dev-seed-cathy', nickname: '演示用户 Cathy', name: '王芳', phone: '13900000003', detail: '人民路 88 号' }
    ]
    const userIds = new Map<string, string>()
    for (const demo of demoUsers) {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users(openid,nickname) VALUES($1,$2)
         ON CONFLICT(openid) DO UPDATE SET nickname=EXCLUDED.nickname,updated_at=now() RETURNING id`, [demo.openid, demo.nickname]
      )
      userIds.set(demo.openid, user.rows[0]!.id)
      await client.query(
        `INSERT INTO addresses(user_id,name,phone,province,city,district,detail,is_default)
         SELECT $1,$2,$3,'上海市','上海市','浦东新区',$4,true
         WHERE NOT EXISTS (SELECT 1 FROM addresses WHERE user_id=$1)`,
        [user.rows[0]!.id, demo.name, demo.phone, demo.detail]
      )
    }

    const skus = await client.query<{ id: string; product_id: string; product_name: string; specification: string; price_cents: number; image_url: string }>(
      `SELECT s.id,s.product_id,p.name AS product_name,s.specification,s.price_cents,p.image_url
       FROM product_skus s JOIN products p ON p.id=s.product_id ORDER BY p.name,s.specification`
    )
    const fixtures = [
      { orderNo: 'DEMO-PENDING-001', user: 'dev-seed-alice', skuIndex: 0, quantity: 1, status: 'PENDING_PAYMENT' },
      { orderNo: 'DEMO-PAID-001', user: 'dev-seed-bob', skuIndex: 1, quantity: 1, status: 'PAID' },
      { orderNo: 'DEMO-SHIPPED-001', user: 'dev-seed-cathy', skuIndex: 2, quantity: 2, status: 'SHIPPED' },
      { orderNo: 'DEMO-COMPLETED-001', user: 'dev-seed-alice', skuIndex: 3, quantity: 1, status: 'COMPLETED' },
      { orderNo: 'DEMO-CANCELLED-001', user: 'dev-seed-bob', skuIndex: 4, quantity: 1, status: 'CANCELLED' }
    ] as const
    for (const fixture of fixtures) {
      const existing = await client.query<{ id: string }>('SELECT id FROM orders WHERE order_no=$1', [fixture.orderNo])
      if (existing.rows[0]) continue
      const userId = userIds.get(fixture.user)!
      const sku = skus.rows[fixture.skuIndex % skus.rows.length]!
      const address = await client.query<Record<string, unknown>>(
        `SELECT id,name,phone,province,city,district,detail,is_default AS "isDefault" FROM addresses WHERE user_id=$1 ORDER BY is_default DESC LIMIT 1`, [userId]
      )
      const subtotal = sku.price_cents * fixture.quantity
      const freight = subtotal >= 9900 ? 0 : 1000
      const created = await client.query<{ id: string }>(
        `INSERT INTO orders(order_no,user_id,address_snapshot,status,subtotal_cents,discount_cents,freight_cents,payable_cents,remark,payment_deadline,paid_at,shipped_at,completed_at,cancelled_at,shipping_carrier,tracking_no,created_at,updated_at)
         VALUES($1,$2,$3,$4::order_status,$5,0,$6,$7,'演示订单',now()+interval '30 minutes',
           CASE WHEN $4 IN ('PAID','SHIPPED','COMPLETED') THEN now()-interval '2 days' END,
           CASE WHEN $4 IN ('SHIPPED','COMPLETED') THEN now()-interval '1 day' END,
           CASE WHEN $4='COMPLETED' THEN now()-interval '12 hours' END,
           CASE WHEN $4='CANCELLED' THEN now()-interval '2 days' END,
           CASE WHEN $4 IN ('SHIPPED','COMPLETED') THEN '顺丰速运' END,
           CASE WHEN $4 IN ('SHIPPED','COMPLETED') THEN 'SF-DEMO-001' END,
           now()-interval '3 days',now()) RETURNING id`,
        [fixture.orderNo, userId, JSON.stringify(address.rows[0] || {}), fixture.status, subtotal, freight, subtotal + freight]
      )
      await client.query(
        `INSERT INTO order_items(order_id,product_id,sku_id,product_name,specification,image_url,unit_price_cents,quantity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [created.rows[0]!.id, sku.product_id, sku.id, sku.product_name, sku.specification, sku.image_url, sku.price_cents, fixture.quantity]
      )
      if (fixture.status !== 'CANCELLED') await client.query('UPDATE product_skus SET stock=GREATEST(0,stock-$1) WHERE id=$2', [fixture.quantity, sku.id])
      if (['PAID', 'SHIPPED', 'COMPLETED'].includes(fixture.status)) {
        await client.query(
          `INSERT INTO payments(order_id,out_trade_no,transaction_id,status,amount_cents)
           VALUES($1,$2,$3,'SUCCESS',$4) ON CONFLICT(out_trade_no) DO NOTHING`,
          [created.rows[0]!.id, fixture.orderNo, `DEMO-TXN-${fixture.orderNo}`, subtotal + freight]
        )
      }
    }
  })
  console.info('Seed data applied')
} finally {
  await db.close()
}
