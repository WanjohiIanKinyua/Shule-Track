import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save } from 'lucide-react';
import { getGrade, getGradeClass, calculateAverage } from '@/lib/grading';

interface ClassItem { id: string; name: string; stream: string | null; }
interface Subject { id: string; name: string; class_id: string; }
interface Student { id: string; full_name: string; admission_number: string; }
interface Mark { student_id: string; score: number; }

const EXAM_TYPES = ['CAT', 'Mid-Term', 'End-Term'];
const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const DEFAULT_SUBJECTS = ['Mathematics', 'English', 'Kiswahili', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'CRE', 'Business Studies'];

export default function MarksPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examType, setExamType] = useState('CAT');
  const [term, setTerm] = useState('Term 1');
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('classes').select('id, name, stream').order('name').then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    supabase.from('subjects').select('*').eq('class_id', selectedClass).order('name')
      .then(({ data }) => { setSubjects(data || []); setSelectedSubject(''); });
    supabase.from('students').select('id, full_name, admission_number').eq('class_id', selectedClass).order('full_name')
      .then(({ data }) => setStudents(data || []));
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClass || !selectedSubject) return;
    supabase.from('marks').select('student_id, score').eq('class_id', selectedClass).eq('subject_id', selectedSubject).eq('exam_type', examType).eq('term', term)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((m: any) => map[m.student_id] = m.score);
        setMarks(map);
      });
  }, [selectedClass, selectedSubject, examType, term]);

  const handleAddSubject = async () => {
    if (!selectedClass || !newSubject) return;
    const { error } = await supabase.from('subjects').insert({ class_id: selectedClass, name: newSubject });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Subject added!' });
    setSubjectDialogOpen(false);
    setNewSubject('');
    const { data } = await supabase.from('subjects').select('*').eq('class_id', selectedClass).order('name');
    setSubjects(data || []);
  };

  const handleSave = async () => {
    setSaving(true);
    for (const [student_id, score] of Object.entries(marks)) {
      await supabase.from('marks').upsert({
        student_id, subject_id: selectedSubject, class_id: selectedClass,
        exam_type: examType, term, score, out_of: 100,
      }, { onConflict: 'student_id,subject_id,exam_type,term' });
    }
    toast({ title: 'Marks saved!' });
    setSaving(false);
  };

  const classLabel = (c: ClassItem) => `${c.name}${c.stream ? ` - ${c.stream}` : ''}`;
  const allScores = Object.values(marks);
  const avg = calculateAverage(allScores);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-heading font-bold">Marks & Grades</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={examType} onValueChange={setExamType}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={term} onValueChange={setTerm}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          {selectedClass && (
            <Dialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Subject</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Subject</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Subject Name</Label>
                    <Select value={newSubject} onValueChange={setNewSubject}>
                      <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
                      <SelectContent>{DEFAULT_SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleAddSubject}>Add Subject</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {!selectedClass || !selectedSubject ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Select a class and subject to enter marks</CardContent></Card>
      ) : students.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No students in this class</CardContent></Card>
      ) : (
        <>
          {allScores.length > 0 && (
            <div className="flex items-center gap-4 mb-4">
              <Card className="px-4 py-2"><span className="text-sm text-muted-foreground">Class Avg: </span><span className="font-heading font-bold">{avg.toFixed(1)}%</span></Card>
              <Card className="px-4 py-2"><span className="text-sm text-muted-foreground">Grade: </span><span className={`font-heading font-bold px-2 py-0.5 rounded ${getGradeClass(getGrade(avg))}`}>{getGrade(avg)}</span></Card>
              <div className="flex-1" />
              <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Marks'}</Button>
            </div>
          )}
          {allScores.length === 0 && (
            <div className="flex justify-end mb-4">
              <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save Marks'}</Button>
            </div>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Adm. No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24 text-center">Score /100</TableHead>
                  <TableHead className="w-16 text-center">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s, i) => {
                  const score = marks[s.id] ?? 0;
                  const grade = getGrade(score);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.admission_number}</TableCell>
                      <TableCell>{s.full_name}</TableCell>
                      <TableCell className="text-center">
                        <Input type="number" min={0} max={100} className="w-20 mx-auto text-center" value={marks[s.id] ?? ''} onChange={e => setMarks(prev => ({ ...prev, [s.id]: Number(e.target.value) }))} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-sm ${getGradeClass(grade)}`}>{grade}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
