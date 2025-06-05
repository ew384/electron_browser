import fetch from 'node-fetch'

async function scanPort(port) {
  try {
    const response = await fetch(`http://localhost:${port}/json`, { 
      timeout: 1000 
    })
    
    if (response.ok) {
      const tabs = await response.json()
      return {
        port,
        available: true,
        tabCount: tabs.length,
        tabs: tabs.map(tab => ({
          title: tab.title,
          url: tab.url,
          type: tab.type
        }))
      }
    }
  } catch (error) {
    return {
      port,
      available: false,
      error: error.message
    }
  }
}

async function scanChromeDebugPorts() {
  console.log('🔍 扫描Chrome调试端口...')
  
  const portsToScan = []
  
  // 默认端口
  portsToScan.push(9222)
  
  // 你的项目中可能使用的端口范围
  for (let i = 9222; i <= 9232; i++) {
    portsToScan.push(i)
  }
  
  // 扩展范围
  for (let i = 9300; i <= 9350; i++) {
    portsToScan.push(i)
  }
  
  const results = []
  
  for (const port of portsToScan) {
    process.stdout.write(`\r扫描端口 ${port}...`)
    const result = await scanPort(port)
    if (result.available) {
      results.push(result)
    }
  }
  
  console.log('\n')
  
  if (results.length === 0) {
    console.log('❌ 没有找到可用的Chrome调试端口')
    console.log('\n💡 请检查:')
    console.log('  1. 是否有Chrome实例在运行')
    console.log('  2. Chrome是否启用了远程调试')
    console.log('  3. 防火墙是否阻止了连接')
    return
  }
  
  console.log(`✅ 找到 ${results.length} 个可用的调试端口:\n`)
  
  results.forEach(result => {
    console.log(`🌐 端口 ${result.port}:`)
    console.log(`   标签页数量: ${result.tabCount}`)
    
    if (result.tabs.length > 0) {
      console.log(`   标签页列表:`)
      result.tabs.forEach((tab, index) => {
        const status = tab.type === 'page' ? '📄' : '🔧'
        console.log(`     ${index + 1}. ${status} ${tab.title}`)
        console.log(`        ${tab.url}`)
      })
    }
    console.log('')
  })
  
  const recommendedPort = results.find(r => 
    r.tabs.some(tab => tab.type === 'page' && tab.url.includes('channels.weixin.qq.com'))
  ) || results.find(r => 
    r.tabs.some(tab => tab.type === 'page')
  ) || results[0]
  
  if (recommendedPort) {
    console.log(`🎯 推荐使用端口 ${recommendedPort.port}`)
    console.log(`\n🚀 试试这个命令:`)
    console.log(`   node cli.js analyze ${recommendedPort.port}`)
  }
}

scanChromeDebugPorts().catch(console.error)
