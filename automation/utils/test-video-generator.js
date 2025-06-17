// automation/utils/test-video-generator.js
// 独立的测试视频生成器，可用于所有平台测试

export class TestVideoGenerator {
    // 创建基础测试视频
    static async createTestVideo(options = {}) {
        const {
            width = 640,
            height = 480,
            duration = 3000,
            title = '平台测试视频',
            fileName = 'test-video.mp4'
        } = options

        console.log(`🎬 创建测试视频: ${fileName}`)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')

        function drawFrame(time) {
            // 渐变背景
            const gradient = ctx.createLinearGradient(0, 0, width, height)
            gradient.addColorStop(0, '#FF6B6B')
            gradient.addColorStop(0.5, '#4ECDC4')
            gradient.addColorStop(1, '#45B7D1')
            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, width, height)

            // 主标题
            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 32px Arial'
            ctx.textAlign = 'center'
            ctx.fillText(title, width / 2, height / 2 - 20)

            // 时间显示
            ctx.font = '24px Arial'
            ctx.fillText(new Date().toLocaleTimeString(), width / 2, height / 2 + 20)

            // 动画元素
            const progress = (time % 2000) / 2000
            ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.3 * Math.sin(progress * Math.PI * 2)})`
            ctx.beginPath()
            ctx.arc(width / 2, height / 2 + 60, 20 + 10 * Math.sin(progress * Math.PI * 4), 0, Math.PI * 2)
            ctx.fill()
        }

        const stream = canvas.captureStream(30)
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/mp4;codecs=avc1.42E01E'
        })

        const chunks = []

        return new Promise((resolve) => {
            mediaRecorder.ondataavailable = (event) => chunks.push(event.data)

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/mp4' })
                const file = new File([blob], fileName, {
                    type: 'video/mp4',
                    lastModified: Date.now()
                })

                stream.getTracks().forEach(track => track.stop())

                console.log(`✅ 测试视频创建完成: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)
                resolve(file)
            }

            mediaRecorder.start()

            const startTime = Date.now()
            function animate() {
                drawFrame(Date.now() - startTime)
                if (Date.now() - startTime < duration) {
                    requestAnimationFrame(animate)
                } else {
                    mediaRecorder.stop()
                }
            }
            animate()
        })
    }

    // 为不同平台创建特定的测试视频
    static async createPlatformTestVideo(platform) {
        const configs = {
            wechat: {
                title: '微信视频号测试',
                fileName: 'wechat-test.mp4'
            },
            douyin: {
                title: '抖音测试视频',
                fileName: 'douyin-test.mp4'
            },
            xiaohongshu: {
                title: '小红书测试视频',
                fileName: 'xiaohongshu-test.mp4'
            }
        }

        const config = configs[platform] || {
            title: '平台测试视频',
            fileName: 'platform-test.mp4'
        }

        return await this.createTestVideo(config)
    }
}