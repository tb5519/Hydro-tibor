徽章编辑器图片主题 · 疾风剑客示例

使用方式
1. 打开控制面板或域管理中的“编辑器主题”。
2. 上传整个 demo.zip；不需要先解压。
3. 检查预览，选择要关联的徽章，再发布。
4. 持有这个有效徽章的学员，可在编程区右上角的主题菜单中选择。

包内文件
theme.json       系统可读取的完整设计配置。
background.jpg   实际使用的图片素材。
preview.jpg      所有已配置区域组合后的完整界面截图，仅作预览，不会当成背景。
README.txt       本说明。

这个示例在多个区域复用一张素材，以不同的位置和遮罩呈现。
你也可以分别制作工具栏、面板、运行按钮、提交按钮和透明 PNG 角饰，再在后台逐一分配。
支持 PNG、JPG、WebP、GIF、AVIF；整体背景也可使用 MP4 或 WebM。
图片支持铺满、完整显示、平铺和拉伸；代码遮罩、基础配色可以调整。

不想写配置时，可以直接把图片打成 ZIP 上传，在后台选择各张图片的用途。
文件名可以自行命名；预览图建议叫 preview.jpg 或 preview.png，也可在后台指定。
theme.json 的 slots 区域可使用 background、toolbar、editor、panel、runButton、submitButton、corner。
每个区域的 asset 是包内相对文件名，fit 可用 cover、contain、tile、stretch。
position 可用 center、left、right、top、bottom、left top、left bottom、right top、right bottom。

素材存储在平台已配置的对象存储中。未启用对象存储时，上传会提示错误，不会存到网站本机作替代。
主题名称和对应徽章由老师设置；主题包本身不包含固定徽章编号。
徽章无需佩戴即可解锁主题，失效后自动回退基础主题。

素材来源：本会话使用内置图片生成工具制作的示例美术，随后作 JPEG 体积优化。
设计提示：深蓝幻想山川与风暴，剑客位于右侧，左侧保留深色清晰编程空间，冰蓝金属装饰，无文字、标志或水印。
