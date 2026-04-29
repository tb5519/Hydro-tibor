## Badge for Hydrooj | Hydrooj徽章管理插件

### 简介

* 管理员可发放徽章，一个徽章可以发放给多个用户，一个用户可拥有多个徽章，但每次只能展示一个徽章，用户可选择启用或停用徽章
* 徽章可显示在ranking、discuss和solution等页面
* 每个徽章都有独立的详情页，点按徽章即可进入对应的详情页

### 快速启用

```bash
cd /root/.hydro/
git clone https://github.com/Godtokoo666/badge-for-hydrooj
hydrooj addon add /root/.hydro/badge-for-hydrooj
pm2 restart hydrooj
```

### 使用

* 本插件开箱即用
* 徽章发放和管理route：/manage/badge，默认权限为PRIV_MANAGE_ALL_DOMAIN，另见控制面板「徽章管理」
* 用户侧徽章管理route：/mybadge，另见用户profile下拉栏「我的徽章」
* 徽章详情页route：/badge/:id，其中id为徽章id，number
* 徽章标题另作为鼠标悬停时的显示名
* 徽章分配可分配给多人，逻辑类似hydrooj比赛的题目或比赛管理员增减

### 其他

* 本插件细节未完善，有建议欢迎提交issue/pr
* 本插件修改了components/user.html组件，如更新后遇前端错误，请自行解决或停用本插件
* 有偿解决本人开发的插件使用问题，联系邮箱 admin@funfs.com
* 请我喝杯咖啡：USDT(TRC20):TGnRYsYqA29SKCaYq5L1ZJYB3gm2VB7iHy
