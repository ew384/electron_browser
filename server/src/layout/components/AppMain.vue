<template>
  <section class="app-main">
    <transition name="fade-transform" mode="out-in">
      <keep-alive :include="cachedViews">
        <router-view :key="key" />
      </keep-alive>
    </transition>
  </section>
</template>

<script>
export default {
  name: 'AppMain',
  computed: {
    cachedViews() {
      return this.$store.state.tagsView.cachedViews
    },
    key() {
      return this.$route.path
    }
  }
}
</script>

<style lang="scss" scoped>
.app-main {
  flex: 1;
  /* 占用剩余空间 */
  width: 100%;
  position: relative;
  overflow: hidden;
  /* 完全移除所有高度设置 */
}

.fixed-header + .app-main {
  padding-top: 50px;
  height: calc(100vh - 100px);
}

.hasTagsView {
  .app-main {
    height: calc(100vh - 84px);
    max-height: calc(100vh - 84px);
  }

  .fixed-header + .app-main {
    padding-top: 84px;
    height: calc(100vh - 134px);
  }
}
</style>

<style lang="scss">
// fix css style bug in open el-dialog
.el-popup-parent--hidden {
  .fixed-header {
    padding-right: 15px;
  }
}
</style>
