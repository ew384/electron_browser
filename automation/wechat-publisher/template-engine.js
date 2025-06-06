// 模板引擎
export class TemplateEngine {
    constructor(config) {
        this.config = config
        console.log('🎨 TemplateEngine 初始化完成')
    }
    
    async render(template, content, account) {
        console.log('🎨 渲染模板')
        
        const context = {
            ...content,
            account: account,
            date: new Date().toLocaleDateString('zh-CN'),
            time: new Date().toLocaleTimeString('zh-CN')
        }
        
        const rendered = {}
        for (const [key, value] of Object.entries(template)) {
            if (typeof value === 'string') {
                rendered[key] = value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
                    const keys = varName.trim().split('.')
                    let result = context
                    for (const k of keys) {
                        result = result?.[k]
                        if (result === undefined) break
                    }
                    return result !== undefined ? String(result) : match
                })
            } else {
                rendered[key] = value
            }
        }
        
        return { ...content, ...rendered }
    }
}
