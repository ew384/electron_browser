.
├── assets
├── automation
│   ├── index.js
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md
│   ├── requirements.txt
│   ├── test-api.js
│   └── test-api.py
├── data
├── electron
│   ├── main
│   │   ├── debug-handlers.ts
│   │   ├── fingerprint
│   │   │   ├── generator.ts
│   │   │   └── validator.ts
│   │   ├── index.ts
│   │   ├── ipc-handlers.ts
│   │   ├── storage
│   │   │   └── account-storage.ts
│   │   └── window-manager.ts
│   ├── package.json
│   ├── preload
│   │   ├── fingerprint
│   │   │   ├── canvas.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── renderer
│   │   ├── App.tsx
│   │   ├── components
│   │   │   ├── AccountCard.tsx
│   │   │   ├── AccountList.tsx
│   │   │   ├── Header.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── index.css
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── stores
│   │   │   └── accountStore.ts
│   │   └── types
│   │       └── electron-api.d.ts
│   ├── shared
│   │   ├── constants.ts
│   │   └── types.ts
│   └── tsconfig.json
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── server
│   ├── babel.config.js
│   ├── jsconfig.json
│   ├── LICENSE
│   ├── mock
│   │   ├── article.js
│   │   ├── index.js
│   │   ├── mock-server.js
│   │   ├── remote-search.js
│   │   ├── role
│   │   │   ├── index.js
│   │   │   └── routes.js
│   │   ├── user.js
│   │   └── utils.js
│   ├── package.json
│   ├── package-lock.json
│   ├── plopfile.js
│   ├── postcss.config.js
│   ├── public
│   │   ├── favicon.ico
│   │   └── index.html
│   ├── README.md
│   ├── src
│   │   ├── api
│   │   │   ├── article.js
│   │   │   ├── electron.js
│   │   │   ├── native.js
│   │   │   ├── remote-search.js
│   │   │   ├── role.js
│   │   │   └── user.js
│   │   ├── App.vue
│   │   ├── assets
│   │   │   ├── 401_images
│   │   │   ├── 404_images
│   │   │   ├── custom-theme
│   │   │   │   ├── fonts
│   │   │   │   └── index.css
│   │   │   └── img
│   │   ├── components
│   │   │   ├── BackToTop
│   │   │   │   └── index.vue
│   │   │   ├── Breadcrumb
│   │   │   │   └── index.vue
│   │   │   ├── Charts
│   │   │   │   ├── Keyboard.vue
│   │   │   │   ├── LineMarker.vue
│   │   │   │   ├── MixChart.vue
│   │   │   │   └── mixins
│   │   │   ├── DndList
│   │   │   │   └── index.vue
│   │   │   ├── DragSelect
│   │   │   │   └── index.vue
│   │   │   ├── Dropzone
│   │   │   │   └── index.vue
│   │   │   ├── ErrorLog
│   │   │   │   └── index.vue
│   │   │   ├── GithubCorner
│   │   │   │   └── index.vue
│   │   │   ├── Hamburger
│   │   │   │   └── index.vue
│   │   │   ├── HeaderSearch
│   │   │   │   └── index.vue
│   │   │   ├── ImageCropper
│   │   │   │   ├── index.vue
│   │   │   │   └── utils
│   │   │   ├── JsonEditor
│   │   │   │   └── index.vue
│   │   │   ├── Kanban
│   │   │   │   └── index.vue
│   │   │   ├── LangSelect
│   │   │   │   └── index.vue
│   │   │   ├── MarkdownEditor
│   │   │   │   ├── default-options.js
│   │   │   │   └── index.vue
│   │   │   ├── MDinput
│   │   │   │   └── index.vue
│   │   │   ├── Pagination
│   │   │   │   └── index.vue
│   │   │   ├── PanThumb
│   │   │   │   └── index.vue
│   │   │   ├── RightPanel
│   │   │   │   └── index.vue
│   │   │   ├── Screenfull
│   │   │   │   └── index.vue
│   │   │   ├── Share
│   │   │   │   └── DropdownMenu.vue
│   │   │   ├── SizeSelect
│   │   │   │   └── index.vue
│   │   │   ├── Sticky
│   │   │   │   └── index.vue
│   │   │   ├── SvgIcon
│   │   │   │   └── index.vue
│   │   │   ├── TextHoverEffect
│   │   │   │   └── Mallki.vue
│   │   │   ├── ThemePicker
│   │   │   │   └── index.vue
│   │   │   ├── Tinymce
│   │   │   │   ├── components
│   │   │   │   ├── dynamicLoadScript.js
│   │   │   │   ├── index.vue
│   │   │   │   ├── plugins.js
│   │   │   │   └── toolbar.js
│   │   │   ├── Upload
│   │   │   │   ├── SingleImage2.vue
│   │   │   │   ├── SingleImage3.vue
│   │   │   │   └── SingleImage.vue
│   │   │   └── UploadExcel
│   │   │       └── index.vue
│   │   ├── directive
│   │   │   ├── clipboard
│   │   │   │   ├── clipboard.js
│   │   │   │   └── index.js
│   │   │   ├── el-drag-dialog
│   │   │   │   ├── drag.js
│   │   │   │   └── index.js
│   │   │   ├── el-table
│   │   │   │   ├── adaptive.js
│   │   │   │   └── index.js
│   │   │   ├── permission
│   │   │   │   ├── index.js
│   │   │   │   └── permission.js
│   │   │   ├── sticky.js
│   │   │   └── waves
│   │   │       ├── index.js
│   │   │       ├── waves.css
│   │   │       └── waves.js
│   │   ├── filters
│   │   │   └── index.js
│   │   ├── icons
│   │   │   ├── index.js
│   │   │   ├── svg
│   │   │   └── svgo.yml
│   │   ├── lang
│   │   │   ├── en.js
│   │   │   ├── index.js
│   │   │   └── zh.js
│   │   ├── layout
│   │   │   ├── components
│   │   │   │   ├── AppMain.vue
│   │   │   │   ├── index.js
│   │   │   │   ├── Navbar.vue
│   │   │   │   ├── Settings
│   │   │   │   ├── Sidebar
│   │   │   │   └── TagsView
│   │   │   ├── index.vue
│   │   │   └── mixin
│   │   │       └── ResizeHandler.js
│   │   ├── main.js
│   │   ├── permission.js
│   │   ├── router
│   │   │   └── index.js
│   │   ├── settings.js
│   │   ├── store
│   │   │   ├── getters.js
│   │   │   ├── index.js
│   │   │   └── modules
│   │   │       ├── app.js
│   │   │       ├── errorLog.js
│   │   │       ├── permission.js
│   │   │       ├── settings.js
│   │   │       ├── tagsView.js
│   │   │       └── user.js
│   │   ├── styles
│   │   │   ├── btn.scss
│   │   │   ├── element-ui.scss
│   │   │   ├── element-variables.scss
│   │   │   ├── index.scss
│   │   │   ├── mixin.scss
│   │   │   ├── sidebar.scss
│   │   │   ├── table-buttons.scss
│   │   │   ├── transition.scss
│   │   │   └── variables.scss
│   │   ├── utils
│   │   │   ├── auth.js
│   │   │   ├── clipboard.js
│   │   │   ├── debug.js
│   │   │   ├── electron-bridge.js
│   │   │   ├── error-log.js
│   │   │   ├── fonts.js
│   │   │   ├── get-page-title.js
│   │   │   ├── i18n.js
│   │   │   ├── index.js
│   │   │   ├── languages.json
│   │   │   ├── open-window.js
│   │   │   ├── permission.js
│   │   │   ├── request.js
│   │   │   ├── scroll-to.js
│   │   │   ├── speech-voices.json
│   │   │   ├── ssl.json
│   │   │   ├── timezones.json
│   │   │   ├── ua-full-versions.json
│   │   │   ├── validate.js
│   │   │   ├── versions.json
│   │   │   └── webgl.json
│   │   ├── vendor
│   │   │   ├── Export2Excel.js
│   │   │   └── Export2Zip.js
│   │   └── views
│   │       ├── browser
│   │       │   ├── group.vue
│   │       │   └── index.vue
│   │       ├── crx
│   │       │   ├── list.vue
│   │       │   └── store.vue
│   │       ├── error-page
│   │       │   ├── 401.vue
│   │       │   └── 404.vue
│   │       ├── login
│   │       │   ├── auth-redirect.vue
│   │       │   ├── components
│   │       │   └── index.vue
│   │       └── redirect
│   │           └── index.vue
│   └── vue.config.js
├── start.js
├── start.sh
├── tree.sh
└── worker
    ├── auto-imports.d.ts
    ├── babel.config.js
    ├── components.d.ts
    ├── package.json
    ├── package-lock.json
    ├── public
    │   ├── favicon.ico
    │   └── index.html
    ├── README.md
    ├── src
    │   ├── App.vue
    │   ├── assets
    │   ├── main.ts
    │   ├── shims-vue.d.ts
    │   └── utils
    │       ├── index.js
    │       └── native.js
    ├── tsconfig.json
    └── vue.config.js

