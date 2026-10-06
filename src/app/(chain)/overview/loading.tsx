import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-4" aria-busy="true">
      <Skeleton layout="kpi" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton layout="kpi" />
        <Skeleton layout="kpi" />
        <Skeleton layout="kpi" />
        <Skeleton layout="kpi" />
      </div>
      <Skeleton layout="table" rows={4} columns={9} />
    </div>
  )
}
