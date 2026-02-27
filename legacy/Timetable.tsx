import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Check, X, Trash2 } from 'lucide-react';

interface ClassItem { id: string; name: string; stream: string | null; }
interface Subject { id: string; name: string; }
interface Lesson {
  id: string;
  subject_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  attended: boolean | null;
  reason: string | null;
  week_date: string | null;
  subjects?: { name: string };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetablePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [open, setOpen] = useState(false);
  const [newDay, setNewDay] = useState('Monday');
  const [newSubject, setNewSubject] = useState('');
  const [newStart, setNewStart] = useState('08:00');
  const [newEnd, setNewEnd] = useState('08:40');
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [currentLesson, setCurrentLesson] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('classes').select('id, name, stream').order('name').then(({ data }) => setClasses(data || []));
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    supabase.from('subjects').select('id, name').eq('class_id', selectedClass).order('name')
      .then(({ data }) => setSubjects(data || []));
    fetchLessons();
  }, [selectedClass]);

  const fetchLessons = async () => {
    if (!selectedClass) return;
    const { data } = await supabase
      .from('timetable_lessons')
      .select('*, subjects(name)')
      .eq('class_id', selectedClass)
      .order('start_time');
    setLessons((data as any) || []);
  };

  const handleAdd = async () => {
    if (!selectedClass || !newSubject) return;
    const { error } = await supabase.from('timetable_lessons').insert({
      class_id: selectedClass,
      subject_id: newSubject,
      day_of_week: newDay,
      start_time: newStart,
      end_time: newEnd,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Lesson added!' });
    setOpen(false);
    fetchLessons();
  };

  const markAttended = async (id: string, attended: boolean) => {
    if (!attended) {
      setCurrentLesson(id);
      setReason('');
      setReasonDialogOpen(true);
      return;
    }
    await supabase.from('timetable_lessons').update({ attended: true, reason: null }).eq('id', id);
    fetchLessons();
  };

  const saveReason = async () => {
    if (!currentLesson) return;
    await supabase.from('timetable_lessons').update({ attended: false, reason }).eq('id', currentLesson);
    setReasonDialogOpen(false);
    fetchLessons();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('timetable_lessons').delete().eq('id', id);
    fetchLessons();
  };

  const classLabel = (c: ClassItem) => `${c.name}${c.stream ? ` - ${c.stream}` : ''}`;
  const totalLessons = lessons.length;
  const attendedCount = lessons.filter(l => l.attended === true).length;
  const notAttendedCount = lessons.filter(l => l.attended === false).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-heading font-bold">Timetable & Coverage</h1>
        <div className="flex items-center gap-3">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}</SelectContent>
          </Select>
          {selectedClass && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Lesson</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Lesson</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Day</Label>
                    <Select value={newDay} onValueChange={setNewDay}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select value={newSubject} onValueChange={setNewSubject}>
                      <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                      <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleAdd}>Add Lesson</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Reason dialog */}
      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reason for Not Attending</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea placeholder="e.g. Public holiday, Teacher absent, School activity" value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <Button className="w-full" onClick={saveReason}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {!selectedClass ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Select a class to view timetable</CardContent></Card>
      ) : (
        <>
          {totalLessons > 0 && (
            <div className="flex items-center gap-4 mb-4 text-sm">
              <span className="text-muted-foreground">Total: {totalLessons}</span>
              <span className="status-attended">Attended: {attendedCount}</span>
              <span className="status-not-attended">Not attended: {notAttendedCount}</span>
              <span className="text-muted-foreground">Coverage: {totalLessons > 0 ? ((attendedCount / totalLessons) * 100).toFixed(0) : 0}%</span>
            </div>
          )}
          {DAYS.map(day => {
            const dayLessons = lessons.filter(l => l.day_of_week === day);
            if (dayLessons.length === 0) return null;
            return (
              <div key={day} className="mb-4">
                <h3 className="font-heading font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wider">{day}</h3>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="w-20 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dayLessons.map(l => (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm">{l.start_time?.slice(0, 5)} - {l.end_time?.slice(0, 5)}</TableCell>
                          <TableCell className="font-medium">{(l as any).subjects?.name || '—'}</TableCell>
                          <TableCell className="text-center">
                            {l.attended === null ? (
                              <span className="text-xs text-muted-foreground">Pending</span>
                            ) : l.attended ? (
                              <span className="status-attended">Attended</span>
                            ) : (
                              <span className="status-not-attended">Not attended</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{l.reason || '—'}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-success hover:bg-success/10" onClick={() => markAttended(l.id, true)}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-warning hover:bg-warning/10" onClick={() => markAttended(l.id, false)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(l.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            );
          })}
          {lessons.length === 0 && (
            <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No lessons scheduled yet. Add your first lesson!</CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}
