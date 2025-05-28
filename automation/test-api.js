const { chromium } = require('playwright')

;(async () => {
  // 通过API启动环境
  const response = await fetch('http://localhost:9000/api/launchBrowser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 1
    })
  })
    .then(res => res.json())
    .catch(err => {
      console.error(err.message)
    })

  // 返回debuggingPort
  console.log(response)

  if (!response.success) {
    return
  }

  // 连接playwright自动化工具
  const browser = await chromium.connectOverCDP(`http://localhost:${response.data.debuggingPort}`)

  // 新开窗口
  // const context = await browser.newContext()
  // 使用当前窗口
  const context = await browser.contexts()[0]
  const page = await context.newPage()

  // 访问您的应用程序
  await page.goto('https://www.baidu.com/')

  const page2 = await context.newPage()
  await page2.goto('https://www.163.com/')

  // 其他测试代码...

  // 关闭浏览器
  // await browser.close() // 调试时可以注释掉此行
})()
