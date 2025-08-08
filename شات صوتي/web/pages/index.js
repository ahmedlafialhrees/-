import Link from 'next/link'
export default function Home(){
  return (<div className="container">
    <h2>StageChat — جاهز للنشر</h2>
    <div className="card"><h3>مستخدم عادي</h3><p><Link href="/join">ادخل</Link></p></div>
    <div className="card"><h3>لوحة الأدمن</h3><p><Link href="/admin/dashboard">افتح لوحة التحكم</Link></p></div>
  </div>)
}