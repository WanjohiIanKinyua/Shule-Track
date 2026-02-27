import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Save } from 'lucide-react';

interface ClassItem { id: string; name: string; stream: string | null; }
interface Student { id: string; full_name: string; admission_number: string; }
interface AttendanceRecord { student_id: string; status: string; }

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('classes').select('id, name, stream').order('name').then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', selectedClass).order('full_name')
      .then(({ data }) => setStudents(data || []));
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClass || students.length === 0) return;
    supabase.from('attendance').select('student_id, status').eq('class_id', selectedClass).eq('date', date)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        students.forEach(s => map[s.id] = 'present');
        (data || []).forEach((a: any) => map[a.student_id] = a.status);
        setAttendance(map);
      });
  }, [selectedClass, date, students]);

  const toggleStatus = (studentId: string) => {
    setAttendance(prev => ({ ...prev, [studentId]: prev[studentId] === 'present' ? 'absent' : 'present' }));
  };

  const handleSave = async () => {
    setSaving(true);
    const records = Object.entries(attendance).map(([student_id, status]) => ({
      student_id,
      class_id: selectedClass,
      date,
      status,
    }));

    for (const record of records) {
      await supabase.from('attendance').upsert(record, { onConflict: 'student_id,date' });
    }
    toast({ title: 'Attendance saved!' });
    setSaving(false);
  };

  const classLabel = (c: ClassItem) => `${c.name}${c.stream ? ` - ${c.stream}` : ''}`;
  const presentCount = Object.values(attendance).filter(s => s === 'present').length;
  const absentCount = Object.values(attendance).filter(s => s === 'absent').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Attendance</h1>
        <div className="flex items-center gap-3">
          <input type="date" className="border rounded-lg px-3 py-2 text-sm bg-card" value={date} onChange={e => setDate(e.target.value)} />
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedClass ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Select a class to mark attendance</CardContent></Card>
      ) : students.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No students in this class</CardContent></Card>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4">
            <span className="status-present">Present: {presentCount}</span>
            <span className="status-absent">Absent: {absentCount}</span>
            <div className="flex-1" />
            <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Attendance'}</Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Adm. No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s, i) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.admission_number}</TableCell>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell className="text-center">
                      <button onClick={() => toggleStatus(s.id)} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        attendance[s.id] === 'present'
                          ? 'bg-success/15 text-success hover:bg-success/25'
                          : 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                      }`}>
                        {attendance[s.id] === 'present' ? <><Check className="h-3 w-3" /> Present</> : <><X className="h-3 w-3" /> Absent</>}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
