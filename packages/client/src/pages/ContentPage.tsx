export default function ContentPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold">内容管理</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        浏览 / 归档 / 新增 content/ 下的各期内容（文稿 · HTML · PNG 预览）
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
        骨架阶段：内容列表 API 与预览组件待接入
      </div>
    </div>
  );
}
