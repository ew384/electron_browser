// 内容处理器
export class ContentProcessor {
    constructor(config) {
        this.config = config
        console.log('📝 ContentProcessor 初始化完成')
    }
    
    async process(content, workflowType) {
        console.log(`📝 处理 ${workflowType} 内容`)
        return content
    }
    
    async generateVariation(content, account) {
        console.log(`🔄 为账号 ${account.id} 生成变化内容`)
        return { ...content, accountId: account.id }
    }
}
