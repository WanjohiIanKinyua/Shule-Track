import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, UserPlus } from 'lucide-react';

interface Student {
  id: string;
  admission_number: string;
  full_name: string;
  gender: string;
  class_id: string;
}

interface ClassItem { id: string; name: string; stream: string | null; }

export default function StudentsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClassId = searchParams.get('classId') || '';
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAdm, setNewAdm] = useState('');
  const [newGender, setNewGender] = useState('Male');
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('classes').select('id, name, stream').order('name').then(({ data }) => {
      setClasses(data || []);
      if (!selectedClassId && data && data.length > 0) {
        setSearchParams({ classId: data[0].id });
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    supabase.from('students').select('*').eq('class_id', selectedClassId).order('full_name')
      .then(({ data }) => setStudents(data || []));
  }, [selectedClassId]);

  const handleAdd = async () => {
    if (!selectedClassId) return;
    const { error } = await supabase.from('students').insert({
      class_id: selectedClassId,
      admission_number: newAdm,
      full_name: newName,
      gender: newGender,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Student added!' });
    setOpen(false);
    setNewName(''); setNewAdm('');
    const { data } = await supabase.from('students').select('*').eq('class_id', selectedClassId).order('full_name');
    setStudents(data || []);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('students').delete().eq('id', id);
    setStudents(students.filter(s => s.id !== id));
  };

  const classLabel = (c: ClassItem) => `${c.name}${c.stream ? ` - ${c.stream}` : ''}`;

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold">Students</h1>
        <div className="flex items-center gap-3">
          <Select value={selectedClassId} onValueChange={v => setSearchParams({ classId: v })}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{classLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!selectedClassId}><UserPlus className="h-4 w-4 mr-2" /> Add Student</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Student</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Admission Number</Label>
                  <Input placeholder="e.g. 2024/001" value={newAdm} onChange={e => setNewAdm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="e.g. John Kamau" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select value={newGender} onValueChange={setNewGender}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleAdd}>Add Student</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!selectedClassId ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Select a class to view students</CardContent></Card>
      ) : students.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No students in this class yet. Add your first student!</CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Adm. No</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{s.admission_number}</TableCell>
                  <TableCell>{s.full_name}</TableCell>
                  <TableCell>{s.gender}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
