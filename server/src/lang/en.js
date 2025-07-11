export default {
  route: {
    dashboard: 'Dashboard',
    browser: 'Browser',
    agent_chat: 'Agent Chat',
    // 在 route 对象中添加
    ai_tools: 'AI Tools',
    ai_tools_platform: 'AI Tools Platform',
    extensions: 'Extensions',
    browser_list: 'List',
    group: 'Group',
    guide: 'Guide',
    permission: 'Permission',
    rolePermission: 'Role Permission',
    pagePermission: 'Page Permission',
    directivePermission: 'Directive Permission',
    icons: 'Icons',
    backToTop: 'Back To Top',
    charts: 'Charts',
    page401: '401',
    page404: '404',
    theme: 'Theme',
    i18n: 'I18n',
    externalLink: 'External Link',
    profile: 'Profile',
    workflow: 'Multi-Platform Publishing',
    workflow_config: 'Workflow Config'
  },
  navbar: {
    dashboard: 'Dashboard',
    github: 'Github',
    logOut: 'Log Out',
    profile: 'Profile',
    theme: 'Theme',
    size: 'Global Size'
  },
  login: {
    title: 'Login Form',
    logIn: 'Login',
    username: 'Username',
    password: 'Password',
    any: 'any',
    thirdparty: 'Or connect with',
    thirdpartyTips:
      'Can not be simulated on local, so please combine you own business simulation! ! !'
  },
  agent: {
    agent: 'Agent',
    agent_chat: 'Agent Chat',
    create_agent: 'Create Agent',
    edit_agent: 'Edit Agent',
    delete_agent: 'Delete Agent',
    agent_list: 'Agent List',
    my_agents: 'My Agents',
    recent_agents: 'Recent',
    all_agents: 'All Agents',
    agent_name: 'Agent Name',
    agent_description: 'Agent Description',
    agent_type: 'Agent Type',
    search_agents: 'Search agents...',
    no_agents: 'No agents',
    create_first_agent: 'Create first agent',
    send_message: 'Send message',
    clear_chat: 'Clear chat',
    file_upload: 'Upload file',
    file_too_large: 'File size cannot exceed 10MB',
    file_added: 'File added',
    chat_cleared: 'Chat cleared',
    confirm_clear: 'Are you sure you want to clear all chat history?',
    confirm_delete: 'Are you sure you want to delete this agent?'
  },
  browser: {
    add: 'Create Browser',
    batchActions: 'Batch Actions',
    batchStart: 'Batch start',
    batchCreate: 'Batch Create',
    batchDelete: 'Batch Delete',
    batchGroup: 'Batch Group',
    name: 'Name',
    browser: 'Browser',
    name_placeholder: 'Please enter browser name',
    search: 'Search',
    import: {
      import: 'Import',
      export: 'Export'
    },
    id: 'ID',
    ip_port: 'IP Port',
    date: 'Date',
    launch: 'Launch',
    launching: 'Launching',
    launched: 'Launched',
    edit: 'Edit',
    delete: 'Delete',
    basic: 'Basic',
    advanced: 'Advanced',
    platform: 'Platform',
    version: 'Version',
    no_proxy: 'No Proxy',
    API: 'API',
    proxy: {
      setting: 'Proxy',
      value: 'Proxy',
      protocol: 'Protocol',
      host: 'Host',
      port: 'Port',
      user: 'Username',
      pass: 'Password',
      API: 'API Link'
    },
    proxy_tips:
      'support HTTP and SOCKS5 protocols<br>example:127.0.0.1:80<br>&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;127.0.0.1:1080@socks#ssh',
    cookie: {
      jsonStr: 'Cookie Import ',
      placeholder:
        'supports arrays containing cookies in JSON format. Please click on the right to view the detailed format',
      format: 'View Format',
      format_error: 'Format Error',
      format_title: 'Cookie Format',
      copy: 'Copy',
      close: 'Close',
      copied: 'Copied'
    },
    homepage: 'HomePage',
    homepage_tips: 'Please enter homepage URL',
    ua: 'User Agent',
    sec_ua: 'Sec-CH-UA',
    timezone: 'TimeZone',
    timezone_tips: 'Generate the corresponding time zone based on IP. Uncheck to customize.',
    webrtc: 'WebRTC',
    location: 'Geolocation',
    location_tips: 'Generate the corresponding geolocation based on IP. Uncheck to customize.',
    language: 'Language',
    language_tips: 'Generate the corresponding language based on IP. Uncheck to customize.',
    longitude: 'longitude',
    latitude: 'latitude',
    precision: 'precision',
    screen: 'Resolution',
    fonts: 'Fonts',
    canvas: 'Canvas',
    webgl_img: 'WebGL Image',
    webgl: 'WebGL Meta',
    webgl_manu: 'WebGL Vendor',
    webgl_render: 'WebGL Renderer',
    audio: 'AudioContext',
    media: 'Media',
    client_rects: 'ClientRects',
    speech_voices: 'Speech Voices',
    ssl: 'SSL',
    ssl_disabled: 'Disable SSL Features',
    cpu: 'CPU',
    cpu_unit: 'Cores',
    memory: 'Memory',
    device: 'Device',
    mac: 'MAC',
    dnt: 'Do Not Track',
    port_scan: 'Port Scan Protection',
    enable_ports: 'Port Sacn White List',
    enable_ports_tips: 'Ports that are allowed to be scanned by websites, separated by commas',
    gpu: 'GPU',
    random_change: 'Change',
    required: 'Required',
    select: 'Please Select',
    cancel: 'Cancel',
    confirm: 'Submit',
    actions: 'Actions',
    default: 'Default',
    random: 'Random',
    custom: 'Custom',
    system_default: 'System Default',
    random_match: 'Random',
    system_match: 'Follow Computer',
    enable: 'Enable',
    disable: 'Disable',
    ask: 'Ask',
    allow: 'Allow',
    block: 'Block',
    replace: 'Replace',
    success: 'Success',
    create: 'Create',
    refresh: 'Refresh', // 新增
    status: 'Status', // 新增
    running: 'Running', // 新增
    stopped: 'Stopped', // 新增
    close: 'Close', // 新增
    fingerprint: 'Fingerprint', // 新增
    viewFingerprint: 'View Fingerprint', // 新增
    fingerprintDetails: 'Fingerprint Details', // 新增
    regenerateFingerprint: 'Regenerate', // 新增
    group: 'Group', // 新增
    userAgent: 'User Agent', // 新增
    update: 'Update',
    delete_confirm: 'Are you sure to delete ${name} ?'
  },
  group: {
    add: 'Create Group',
    name: 'Group Name',
    group: 'Group',
    browser_count: 'Browser Count',
    name_placeholder: 'Please enter group name',
    filter: 'Filter by group',
    default: 'Default Group'
  },
  permission: {
    addRole: 'New Role',
    editPermission: 'Edit',
    roles: 'Your roles',
    switchRoles: 'Switch roles',
    tips: 'In some cases, using v-permission will have no effect. For example: Element-UI  el-tab or el-table-column and other scenes that dynamically render dom. You can only do this with v-if.',
    delete: 'Delete',
    confirm: 'Confirm',
    cancel: 'Cancel'
  },
  guide: {
    description:
      'The guide page is useful for some people who entered the project for the first time. You can briefly introduce the features of the project. Demo is based on ',
    button: 'Show Guide'
  },
  errorLog: {
    tips: 'Please click the bug icon in the upper right corner',
    description:
      'Now the management system are basically the form of the spa, it enhances the user experience, but it also increases the possibility of page problems, a small negligence may lead to the entire page deadlock. Fortunately Vue provides a way to catch handling exceptions, where you can handle errors or report exceptions.',
    documentation: 'Document introduction'
  },
  theme: {
    change: 'Change Theme',
    documentation: 'Theme documentation',
    tips: 'Tips: It is different from the theme-pick on the navbar is two different skinning methods, each with different application scenarios. Refer to the documentation for details.'
  },
  tagsView: {
    refresh: 'Refresh',
    close: 'Close',
    closeOthers: 'Close Others',
    closeAll: 'Close All'
  },
  settings: {
    title: 'Page style setting',
    theme: 'Theme Color',
    tagsView: 'Open Tags-View',
    fixedHeader: 'Fixed Header',
    sidebarLogo: 'Sidebar Logo'
  }
}
